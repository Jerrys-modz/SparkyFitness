import { ApiError } from '../../src/services/api/errors';
import { saveRecordedActivity } from '../../src/services/gpsRecordingSave';
import { saveFitnessTest } from '../../src/services/fitnessTestService';
import { completeProgramWorkout } from '../../src/services/runProgramService';
import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerRunHandlers } from '../../src/offline/handlers/run';
import { getOutboxRow, listUnconfirmedOutbox } from '../../src/offline/outbox';
import {
  RUN_FITNESS_TEST,
  RUN_PROGRAM_TICK,
  RUN_SAVE,
  queueRecordedRun,
  type QueuedRecordingPayload,
} from '../../src/offline/runHandOver';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import type { RecordingSession } from '../../src/services/gpsRecordingService';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/gpsRecordingSave', () => ({
  saveRecordedActivity: jest.fn(),
}));
jest.mock('../../src/services/fitnessTestService', () => ({
  saveFitnessTest: jest.fn(),
}));
jest.mock('../../src/services/runProgramService', () => ({
  completeProgramWorkout: jest.fn(),
}));
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

const mockSave = saveRecordedActivity as jest.MockedFunction<
  typeof saveRecordedActivity
>;
const mockTest = saveFitnessTest as jest.MockedFunction<typeof saveFitnessTest>;
const mockTick = completeProgramWorkout as jest.MockedFunction<
  typeof completeProgramWorkout
>;

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const T0 = new Date(2026, 10, 16, 7, 5, 0).getTime();

const session: RecordingSession = {
  id: `rec-${T0}`,
  entryClientId: ENTRY_ID,
  activity: 'run',
  status: 'finished',
  startedAt: T0,
  finishedAt: T0 + 1_800_000,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
};

const input = {
  session,
  points: [
    { t: T0, lat: 52, lon: 4, alt: 1, accuracy: 5, seg: 0 },
    { t: T0 + 60_000, lat: 52.001, lon: 4, alt: 1, accuracy: 5, seg: 0 },
  ],
  distanceUnit: 'km' as const,
  indoorDistanceKm: null,
  indoorEstimate: null,
  acceptedIndoorEstimate: false,
  heartRate: [{ t: T0, bpm: 150 }],
  appleZones: null,
  fitnessTest: null,
  programTick: null,
};

describe('queued runs', () => {
  let db: OfflineDb;
  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerRunHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });
  afterEach(() => {
    __setOfflineDbForTests(null);
  });

  it('queues the run under the entry id the recording already has', async () => {
    const queued = await queueRecordedRun(input);
    expect(queued).toEqual({ entryId: ENTRY_ID, entryDate: '2026-11-16' });
    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: RUN_SAVE,
      entityId: ENTRY_ID,
      entryDate: '2026-11-16',
      userId: 'u1',
    });
  });

  it('makes an id for a recording from an older build', async () => {
    const queued = await queueRecordedRun({
      ...input,
      session: { ...session, entryClientId: undefined },
    });
    expect(queued?.entryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hands on the entry an earlier live attempt already created', async () => {
    await queueRecordedRun({
      ...input,
      session: { ...session, savedEntryId: 'server-entry', savedForm: null },
    });
    const [row] = await listUnconfirmedOutbox(db, 's1');
    const payload = row!.payload as QueuedRecordingPayload;
    expect(payload.entryId).toBe('server-entry');
    expect(payload.progress.entryId).toBe('server-entry');
  });

  it('sends the run with its id, heart rate and saved progress', async () => {
    await queueRecordedRun(input);
    mockSave.mockResolvedValue({
      entryId: ENTRY_ID,
      entryDate: '2026-11-16',
      form: null,
    });
    const summary = await drainOutbox('manual');
    expect(summary).toEqual({ synced: 1, remaining: 0 });
    const call = mockSave.mock.calls[0]!;
    expect(call[6]).toMatchObject({
      clientEntryId: ENTRY_ID,
      heartRate: [{ t: T0, bpm: 150 }],
      appleZones: null,
      resume: {},
    });
  });

  it('keeps the run waiting when the server cannot be reached', async () => {
    await queueRecordedRun(input);
    mockSave.mockRejectedValue(new TypeError('Network request failed'));
    const summary = await drainOutbox('manual');
    expect(summary).toEqual({ synced: 0, remaining: 1 });
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row!.status).toBe('pending');
  });

  it('carries on from the step an earlier attempt reached', async () => {
    await queueRecordedRun(input);
    mockSave.mockImplementationOnce(async (...args) => {
      await args[6]!.onProgress({ entryId: ENTRY_ID, form: null });
      throw new TypeError('Network request failed');
    });
    await drainOutbox('manual');
    mockSave.mockResolvedValue({
      entryId: ENTRY_ID,
      entryDate: '2026-11-16',
      form: null,
    });
    await drainOutbox('manual');
    const resumeOnSecondAttempt = mockSave.mock.calls[1]![6]!.resume;
    expect(resumeOnSecondAttempt).toEqual({ entryId: ENTRY_ID, form: null });
  });

  it('parks a run the server refuses for the person', async () => {
    await queueRecordedRun(input);
    mockSave.mockRejectedValue(new ApiError(400, 'bad'));
    await drainOutbox('manual');
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row!.status).toBe('failed');
  });

  it('sends the program tick and the fitness test only after the run', async () => {
    await queueRecordedRun({
      ...input,
      programTick: { programId: 'p1', index: 2 },
      fitnessTest: {
        test_type: '5k',
        test_date: '2026-11-16',
        distance_meters: 5000,
        duration_seconds: 1500,
        surface: 'outdoor',
      },
    });
    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((row) => row.kind).sort()).toEqual(
      [RUN_FITNESS_TEST, RUN_PROGRAM_TICK, RUN_SAVE].sort()
    );
    const save = rows.find((row) => row.kind === RUN_SAVE)!;
    expect(
      rows.filter((row) => row.kind !== RUN_SAVE).map((r) => r.dependsOn)
    ).toEqual([save.id, save.id]);

    // The connection is down: the run fails and nothing behind it is sent.
    mockSave.mockRejectedValueOnce(new TypeError('Network request failed'));
    await drainOutbox('manual');
    expect(mockTick).not.toHaveBeenCalled();
    expect(mockTest).not.toHaveBeenCalled();

    mockSave.mockResolvedValue({
      entryId: ENTRY_ID,
      entryDate: '2026-11-16',
      form: null,
    });
    mockTick.mockResolvedValue(undefined);
    mockTest.mockResolvedValue({} as never);
    const summary = await drainOutbox('manual');
    expect(summary).toEqual({ synced: 3, remaining: 0 });
    expect(mockTick).toHaveBeenCalledWith('p1', 2, '2026-11-16', ENTRY_ID);
    expect(mockTest.mock.calls[0]![0]).toMatchObject({
      exercise_entry_id: ENTRY_ID,
      test_type: '5k',
    });
  });

  it('drops a follow-up the server refuses once the run is uploaded', async () => {
    await queueRecordedRun({
      ...input,
      programTick: { programId: 'p1', index: 2 },
    });
    mockSave.mockResolvedValue({
      entryId: ENTRY_ID,
      entryDate: '2026-11-16',
      form: null,
    });
    mockTick.mockRejectedValue(new ApiError(409, 'not due'));
    const summary = await drainOutbox('manual');
    expect(summary).toEqual({ synced: 2, remaining: 0 });
    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows).toHaveLength(0);
  });

  it('keeps a follow-up waiting while the connection is down', async () => {
    await queueRecordedRun({
      ...input,
      programTick: { programId: 'p1', index: 2 },
    });
    mockSave.mockResolvedValue({
      entryId: ENTRY_ID,
      entryDate: '2026-11-16',
      form: null,
    });
    mockTick.mockRejectedValue(new TypeError('Network request failed'));
    const summary = await drainOutbox('manual');
    expect(summary).toEqual({ synced: 1, remaining: 1 });
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row!.kind).toBe(RUN_PROGRAM_TICK);
    expect((await getOutboxRow(db, row!.id))!.status).toBe('pending');
  });
});
