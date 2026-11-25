import { renderHook, act } from '@testing-library/react-native';
import {
  WATCH_SILENT_GRACE_MS,
  currentExerciseEntryId,
  usePhoneHeartRate,
} from '../../src/hooks/usePhoneHeartRate';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';
import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';
import { useWatchRunLiveStore } from '../../src/stores/watchRunLiveStore';

type Listener = (payload: never) => void;
const mockListeners = new Map<string, Listener>();
const mockNative = {
  isAvailable: jest.fn(() => true),
  start: jest.fn(() => Promise.resolve(true)),
  stop: jest.fn(() => Promise.resolve()),
  addListener: jest.fn((name: string, listener: Listener) => {
    mockListeners.set(name, listener);
    return { remove: jest.fn(() => mockListeners.delete(name)) };
  }),
};

jest.mock('../../modules/live-heart-rate', () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
}));

const session = {
  exercises: [
    { id: 'entry-a', sets: [{ id: 1 }, { id: 2 }] },
    { id: 'entry-b', sets: [{ id: 3 }] },
  ],
};

describe('currentExerciseEntryId', () => {
  it('finds the entry that holds the active set', () => {
    expect(currentExerciseEntryId({ activeSetId: '3', session })).toBe(
      'entry-b'
    );
  });

  it('is null with no active set or no session', () => {
    expect(currentExerciseEntryId({ activeSetId: null, session })).toBeNull();
    expect(currentExerciseEntryId({ activeSetId: '1', session: null })).toBe(
      null
    );
    expect(currentExerciseEntryId({ activeSetId: '99', session })).toBeNull();
  });
});

describe('usePhoneHeartRate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    mockNative.isAvailable.mockReturnValue(true);
    useLiveHeartRateStore.setState({ reading: null });
    useWatchRunLiveStore.setState({ run: null, pending: null } as never);
    useActiveWorkoutStore.setState({
      sessionId: null,
      activeSetId: null,
      session: null,
    } as never);
  });

  it('opens a session when a workout goes live and closes it when it ends', async () => {
    renderHook(() => usePhoneHeartRate(false));
    expect(mockNative.start).not.toHaveBeenCalled();

    await act(async () => {
      useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
    });
    expect(mockNative.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      useActiveWorkoutStore.setState({ sessionId: null } as never);
    });
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('never runs beside a run the watch is recording', async () => {
    renderHook(() => usePhoneHeartRate(false));
    useWatchRunLiveStore.setState({
      run: { runId: 'r1', status: 'running' },
    } as never);
    await act(async () => {
      useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
    });
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('closes a session already open when a watch run starts', async () => {
    renderHook(() => usePhoneHeartRate(false));
    await act(async () => {
      useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
    });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      useWatchRunLiveStore.setState({
        pending: { requestId: 'q1' },
      } as never);
    });
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('records a reading against the exercise being done', async () => {
    renderHook(() => usePhoneHeartRate(false));
    await act(async () => {
      useActiveWorkoutStore.setState({
        sessionId: 's1',
        activeSetId: '3',
        session,
      } as never);
    });
    act(() => {
      (mockListeners.get('onHeartRate') as Listener)({
        bpm: 131.6,
        at: 1000,
      } as never);
    });
    expect(useLiveHeartRateStore.getState().reading).toEqual({
      sessionId: 's1',
      exerciseEntryId: 'entry-b',
      bpm: 132,
      at: 1000,
      source: 'phone',
    });
  });

  it('hands each reading to the upload buffer with an ISO time', async () => {
    const onSample = jest.fn();
    renderHook(() => usePhoneHeartRate(false, onSample));
    await act(async () => {
      useActiveWorkoutStore.setState({
        sessionId: 's1',
        activeSetId: '1',
        session,
      } as never);
    });
    act(() => {
      (mockListeners.get('onHeartRate') as Listener)({
        bpm: 120.2,
        at: Date.UTC(2026, 10, 25, 10, 0, 0),
      } as never);
    });
    expect(onSample).toHaveBeenCalledWith('s1', {
      t: '2026-11-25T10:00:00.000Z',
      bpm: 120,
    });
  });

  describe('with a watch paired', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('steps in only after the watch has stayed silent', async () => {
      renderHook(() => usePhoneHeartRate(true));
      await act(async () => {
        useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
      });
      expect(mockNative.start).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(WATCH_SILENT_GRACE_MS);
      });
      expect(mockNative.start).toHaveBeenCalledTimes(1);
    });

    it('never starts when the watch is heard within the wait', async () => {
      renderHook(() => usePhoneHeartRate(true));
      await act(async () => {
        useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
      });
      act(() => {
        useLiveHeartRateStore.getState().record({
          sessionId: 's1',
          exerciseEntryId: 'entry-a',
          bpm: 110,
          at: 1,
        });
      });
      await act(async () => {
        jest.advanceTimersByTime(WATCH_SILENT_GRACE_MS * 2);
      });
      expect(mockNative.start).not.toHaveBeenCalled();
    });

    it('hands back to the watch once it is heard', async () => {
      renderHook(() => usePhoneHeartRate(true));
      await act(async () => {
        useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
        jest.advanceTimersByTime(WATCH_SILENT_GRACE_MS);
      });
      expect(mockNative.start).toHaveBeenCalledTimes(1);

      await act(async () => {
        useLiveHeartRateStore.getState().record({
          sessionId: 's1',
          exerciseEntryId: 'entry-a',
          bpm: 110,
          at: 2,
        });
      });
      expect(mockNative.stop).toHaveBeenCalledTimes(1);
    });

    it("does not mistake the phone's own reading for the watch", async () => {
      renderHook(() => usePhoneHeartRate(true));
      await act(async () => {
        useActiveWorkoutStore.setState({
          sessionId: 's1',
          activeSetId: '1',
          session,
        } as never);
        jest.advanceTimersByTime(WATCH_SILENT_GRACE_MS);
      });
      act(() => {
        (mockListeners.get('onHeartRate') as Listener)({
          bpm: 100,
          at: 5,
        } as never);
      });
      expect(useLiveHeartRateStore.getState().reading?.source).toBe('phone');
      expect(mockNative.stop).not.toHaveBeenCalled();
    });
  });

  it('does nothing where the OS cannot run a session', async () => {
    mockNative.isAvailable.mockReturnValue(false);
    renderHook(() => usePhoneHeartRate(false));
    await act(async () => {
      useActiveWorkoutStore.setState({ sessionId: 's1' } as never);
    });
    expect(mockNative.start).not.toHaveBeenCalled();
  });
});
