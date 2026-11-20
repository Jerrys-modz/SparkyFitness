import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueWatchRun } from '../../src/services/watchRunQueue';
import type { WatchRunPayload } from '../../src/utils/watchRun';
import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  mergeWaitingWorkouts,
  readOfflineDiaryDay,
} from '../../src/offline/diaryDay';
import {
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  RUN_SAVE,
  discardQueuedRun,
  noteZonesForQueuedRun,
  queueRecordedRun,
  queueRunDelete,
  type QueuedRecordingPayload,
} from '../../src/offline/runHandOver';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import type { RecordingSession } from '../../src/services/gpsRecordingService';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const T0 = new Date(2026, 10, 16, 7, 5, 0).getTime();
const DEG_PER_METER = 1 / 111_194.9;

const session: RecordingSession = {
  id: `rec-${T0}`,
  entryClientId: ENTRY_ID,
  activity: 'run',
  status: 'finished',
  startedAt: T0,
  finishedAt: T0 + 1_800_000,
  pausedAt: null,
  pausedMs: 300_000,
  seg: 0,
  savedEntryId: null,
};

const points = Array.from({ length: 11 }, (_, i) => ({
  t: T0 + i * 100_000,
  lat: 51.5 + i * 250 * DEG_PER_METER,
  lon: -0.12,
  alt: 10,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const input = {
  session,
  points,
  distanceUnit: 'km' as const,
  indoorDistanceKm: null,
  indoorEstimate: null,
  acceptedIndoorEstimate: false,
  heartRate: [
    { t: T0, bpm: 140 },
    { t: T0 + 60_000, bpm: 150 },
  ],
  appleZones: null,
  fitnessTest: null,
  programTick: null,
};

describe('a run saved on the phone in the Diary', () => {
  let db: OfflineDb;
  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });
  afterEach(() => {
    __setOfflineDbForTests(null);
  });

  it('shows as the entry the server will make', async () => {
    await queueRecordedRun(input);
    const day = await readOfflineDiaryDay('2026-11-16');
    expect(day.waiting).toHaveLength(1);
    expect(day.waiting[0]).toMatchObject({
      type: 'individual',
      id: ENTRY_ID,
      name: 'Running',
      entry_date: '2026-11-16',
      entry_time: '07:05',
      // 30 minutes on the clock less 5 paused.
      duration_minutes: 25,
      avg_heart_rate: 145,
    });
    expect(day.waiting[0]).toMatchObject({
      distance: expect.closeTo(2.5, 1),
      calories_burned: 250,
    });
  });

  it('names an indoor run as the server will', async () => {
    await queueRecordedRun({
      ...input,
      session: { ...session, indoor: true },
      points: [],
      indoorDistanceKm: 5,
    });
    const day = await readOfflineDiaryDay('2026-11-16');
    expect(day.waiting[0]).toMatchObject({
      name: 'Indoor Running',
      distance: 5,
    });
  });

  it('is not shown on another day', async () => {
    await queueRecordedRun(input);
    expect((await readOfflineDiaryDay('2026-11-17')).waiting).toEqual([]);
  });

  it('is merged in next to the day the server last answered', async () => {
    await queueRecordedRun(input);
    const day = await readOfflineDiaryDay('2026-11-16');
    const merged = mergeWaitingWorkouts([], day.waiting);
    expect(merged.map((entry) => entry.id)).toEqual([ENTRY_ID]);
  });

  it('can be removed while it is only on the phone', async () => {
    await queueRecordedRun({
      ...input,
      programTick: { programId: 'p1', index: 0 },
    });
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(2);
    expect(await discardQueuedRun(ENTRY_ID)).toEqual({
      outcome: 'removed',
      entryDate: '2026-11-16',
    });
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(0);
  });

  it('is reported as on the server once an attempt created the entry', async () => {
    await queueRecordedRun({
      ...input,
      programTick: { programId: 'p1', index: 0 },
    });
    const row = (await listUnconfirmedOutbox(db, 's1')).find(
      (candidate) => candidate.kind === RUN_SAVE
    );
    const payload = row!.payload as QueuedRecordingPayload;
    await updateOutboxRow(db, row!.id, {
      payload: { ...payload, progress: { entryId: ENTRY_ID } },
    });
    expect(await discardQueuedRun(ENTRY_ID)).toEqual({
      outcome: 'on_server',
      entryDate: '2026-11-16',
    });
    // The rest of its upload is dropped; the caller queues the removal.
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(0);
  });

  it('answers none for a run that is not queued', async () => {
    expect(await discardQueuedRun(ENTRY_ID)).toEqual({ outcome: 'none' });
  });

  it('is hidden from the Diary once its removal is queued', async () => {
    expect(await queueRunDelete(ENTRY_ID, '2026-11-16')).toBe(true);
    const day = await readOfflineDiaryDay('2026-11-16');
    expect(day.deleted).toEqual([ENTRY_ID]);
    const merged = mergeWaitingWorkouts(
      [{ type: 'individual', id: ENTRY_ID } as never],
      day.waiting,
      day.deleted
    );
    expect(merged).toEqual([]);
  });

  describe('late heart rate zones from Apple', () => {
    const zones = [{ index: 1, seconds: 600 }] as never;

    it('are kept with a run that is still waiting', async () => {
      await queueRecordedRun(input);
      expect(await noteZonesForQueuedRun(session.id, zones)).toEqual({
        outcome: 'queued',
      });
      const [row] = await listUnconfirmedOutbox(db, 's1');
      expect((row!.payload as QueuedRecordingPayload).appleZones).toEqual(
        zones
      );
    });

    it('go to the entry once the run has uploaded', async () => {
      await queueRecordedRun(input);
      const [row] = await listUnconfirmedOutbox(db, 's1');
      await updateOutboxRow(db, row!.id, {
        status: 'synced',
        syncedAt: Date.now(),
      });
      expect(await noteZonesForQueuedRun(session.id, zones)).toEqual({
        outcome: 'on_server',
        entryId: ENTRY_ID,
      });
    });

    it('are left alone for a recording that was never queued', async () => {
      expect(await noteZonesForQueuedRun('rec-unknown', zones)).toEqual({
        outcome: 'none',
      });
    });
  });
});

describe('a watch run waiting in its own queue, in the Diary', () => {
  let db: OfflineDb;
  const watchRun: WatchRunPayload = {
    clientId: 'w1',
    kind: 'run',
    place: 'outdoor',
    startedAt: T0,
    endedAt: T0 + 1_800_000,
    activeSeconds: 1500,
    distanceMeters: 5000,
    activeEnergyKcal: 320,
    route: [],
    heartRate: [
      [T0, 140],
      [T0 + 60_000, 160],
    ],
    laps: [],
    lapDistances: [],
    distanceSeries: [],
    planId: null,
    program: null,
    planCompleted: false,
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('activeServerConfigId', 's1');
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });
  afterEach(() => {
    __setOfflineDbForTests(null);
  });

  it('shows as the entry it will be filed as', async () => {
    await enqueueWatchRun(watchRun);
    const day = await readOfflineDiaryDay('2026-11-16');
    expect(day.waiting).toHaveLength(1);
    expect(day.waiting[0]).toMatchObject({
      type: 'individual',
      name: 'Running',
      duration_minutes: 25,
      distance: 5,
      calories_burned: 320,
      avg_heart_rate: 150,
    });
  });

  it('is left out of another day', async () => {
    await enqueueWatchRun(watchRun);
    expect((await readOfflineDiaryDay('2026-11-17')).waiting).toEqual([]);
  });
});
