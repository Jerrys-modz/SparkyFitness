import { __setOfflineDbForTests } from '../../src/offline/db';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  RUN_DELETE,
  RUN_SAVE,
  queueRecordedRun,
  type QueuedRecordingPayload,
} from '../../src/offline/runHandOver';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import { discardWaitingRun } from '../../src/offline/waitingRuns';
import type { OfflineDb } from '../../src/offline/types';
import type { RecordingSession } from '../../src/services/gpsRecordingService';
import {
  enqueueWatchRun,
  readWaitingWatchRuns,
} from '../../src/services/watchRunQueue';
import type { WatchRunPayload } from '../../src/utils/watchRun';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

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
  points: [],
  distanceUnit: 'km' as const,
  indoorDistanceKm: 5,
  indoorEstimate: null,
  acceptedIndoorEstimate: false,
  heartRate: [],
  appleZones: null,
  fitnessTest: null,
  programTick: null,
};
const watchRun: WatchRunPayload = {
  clientId: 'w1',
  kind: 'run',
  place: 'outdoor',
  startedAt: T0,
  endedAt: T0 + 1_800_000,
  activeSeconds: 1500,
  distanceMeters: 5000,
  activeEnergyKcal: 300,
  route: [],
  heartRate: [],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
};

describe('removing a run that has not finished uploading', () => {
  let db: OfflineDb;
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

  it('just drops a phone run that is only on the phone', async () => {
    await queueRecordedRun(input);
    expect(await discardWaitingRun(ENTRY_ID)).toBe(true);
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('also queues the removal for a phone run an attempt already put on the server', async () => {
    await queueRecordedRun(input);
    const [row] = await listUnconfirmedOutbox(db, 's1');
    await updateOutboxRow(db, row!.id, {
      payload: {
        ...(row!.payload as QueuedRecordingPayload),
        progress: { entryId: ENTRY_ID },
      },
    });
    expect(await discardWaitingRun(ENTRY_ID)).toBe(true);
    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((r) => [r.kind, r.entityId])).toEqual([
      [RUN_DELETE, ENTRY_ID],
    ]);
    expect(rows.some((r) => r.kind === RUN_SAVE)).toBe(false);
  });

  it('drops a watch run from its own queue', async () => {
    await enqueueWatchRun(watchRun);
    const [waiting] = await readWaitingWatchRuns();
    expect(await discardWaitingRun(waiting!.entryId!)).toBe(true);
    expect(await readWaitingWatchRuns()).toEqual([]);
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('answers false when nothing is waiting under that id', async () => {
    expect(await discardWaitingRun('nothing')).toBe(false);
  });
});
