import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueueWatchRun,
  processWatchRunQueue,
} from '../../src/services/watchRunQueue';
import { saveWatchRun } from '../../src/services/watchRunSave';
import { ApiError } from '../../src/services/api/errors';
import type { WatchRunPayload } from '../../src/utils/watchRun';

jest.mock('../../src/services/watchRunSave');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockedSave = jest.mocked(saveWatchRun);

const run = (clientId: string): WatchRunPayload => ({
  clientId,
  kind: 'walk',
  place: 'outdoor',
  startedAt: new Date(2026, 9, 10, 8, 0).getTime(),
  endedAt: new Date(2026, 9, 10, 8, 30).getTime(),
  activeSeconds: 1800,
  distanceMeters: 2000,
  activeEnergyKcal: 100,
  route: [],
  heartRate: [],
});

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedSave.mockReset();
});

test('files a queued run once and ignores a re-delivered copy', async () => {
  mockedSave.mockResolvedValue('entry-1');
  expect(await enqueueWatchRun(run('a'))).toBe(true);
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(await enqueueWatchRun(run('a'))).toBe(false);
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).toHaveBeenCalledTimes(1);
});

test('keeps a run for a retry after a network failure, reusing the entry', async () => {
  await enqueueWatchRun(run('b'));
  mockedSave.mockImplementationOnce(async (_p, _u, _e, onEntryCreated) => {
    await onEntryCreated('entry-9');
    throw new Error('offline');
  });
  expect(await processWatchRunQueue('km')).toEqual([]);

  mockedSave.mockResolvedValueOnce('entry-9');
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(mockedSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ clientId: 'b' }),
    'km',
    'entry-9',
    expect.any(Function)
  );
});

test('drops a run the server will never accept', async () => {
  await enqueueWatchRun(run('c'));
  mockedSave.mockRejectedValueOnce(new ApiError('bad', 400));
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).toHaveBeenCalledTimes(1);
});
