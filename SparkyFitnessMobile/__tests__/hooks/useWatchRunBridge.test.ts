import { act, renderHook } from '@testing-library/react-native';
import { useWatchRunBridge } from '../../src/hooks/useWatchRunBridge';
import { usePreferences } from '../../src/hooks/usePreferences';
import WatchConnectivity from '../../modules/watch-connectivity';
import { useWatchRunLiveStore } from '../../src/stores/watchRunLiveStore';
import {
  hasQueuedWatchRuns,
  processWatchRunQueue,
} from '../../src/services/watchRunQueue';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));
jest.mock('../../src/services/watchRunQueue', () => ({
  enqueueWatchRun: jest.fn(() => Promise.resolve(true)),
  processWatchRunQueue: jest.fn(() => Promise.resolve([])),
  hasQueuedWatchRuns: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../src/services/watchRunToast', () => ({
  announceWatchRun: jest.fn(),
}));
jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const prefs = jest.mocked(usePreferences);
const process = jest.mocked(processWatchRunQueue);
const queued = jest.mocked(hasQueuedWatchRuns);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  queued.mockResolvedValue(false);
});

test('waits for the preferences, so a miles user is not filed in km', async () => {
  prefs.mockReturnValue({ preferences: undefined } as never);
  const { rerender } = renderHook(() => useWatchRunBridge(true, true));
  await flush();
  expect(process).not.toHaveBeenCalled();

  prefs.mockReturnValue({
    preferences: { default_distance_unit: 'miles' },
  } as never);
  rerender({});
  await flush();
  expect(process).toHaveBeenCalledWith('miles', expect.any(Function));
});

test('schedules another try in a minute while a run is still queued, and not once the queue is empty', async () => {
  const timeout = jest.spyOn(global, 'setTimeout');
  prefs.mockReturnValue({
    preferences: { default_distance_unit: 'km' },
  } as never);
  queued.mockResolvedValue(true);
  const { unmount } = renderHook(() => useWatchRunBridge(true, true));
  await flush();
  expect(process).toHaveBeenCalledTimes(1);
  expect(timeout).toHaveBeenCalledWith(expect.any(Function), 60_000);

  // Running the scheduled try drains again; an empty queue schedules nothing.
  queued.mockResolvedValue(false);
  const retry = timeout.mock.calls.find(
    ([, ms]) => ms === 60_000
  )![0] as () => void;
  timeout.mockClear();
  await act(async () => {
    retry();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(process).toHaveBeenCalledTimes(2);
  expect(timeout).not.toHaveBeenCalledWith(expect.any(Function), 60_000);
  unmount();
  timeout.mockRestore();
});

test('shows a run the watch is recording and clears it when the run finishes', async () => {
  prefs.mockReturnValue({
    preferences: { default_distance_unit: 'km' },
  } as never);
  const listeners: Record<string, (payload: never) => void> = {};
  jest.mocked(WatchConnectivity!.addListener).mockImplementation(((
    name: string,
    fn: (payload: never) => void
  ) => {
    listeners[name] = fn;
    return { remove: jest.fn() };
  }) as never);
  useWatchRunLiveStore.getState().clear();
  renderHook(() => useWatchRunBridge(true, true));
  await flush();

  act(() =>
    listeners.onRunLive({
      runId: 'r1',
      kind: 'run',
      place: 'indoor',
      status: 'running',
      autoPaused: false,
      elapsed: 60,
      distanceMeters: 200,
      energyKcal: 10,
      lapCount: 0,
      sentAt: Date.now(),
    } as never)
  );
  expect(useWatchRunLiveStore.getState().run?.runId).toBe('r1');

  act(() => listeners.onRunFinished({ clientId: '' } as never));
  expect(useWatchRunLiveStore.getState().run).toBeNull();
});
