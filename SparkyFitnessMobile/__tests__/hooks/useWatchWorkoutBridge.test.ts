import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchWorkoutBridge } from '../../src/hooks/useWatchWorkoutBridge';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  updateWorkout,
  attachExerciseEntryHeartRate,
} from '../../src/services/api/exerciseApi';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/api/exerciseApi', () => ({
  updateWorkout: jest.fn(),
  attachExerciseEntryHeartRate: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({
  syncExerciseSessionInCache: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

/**
 * Captured mockListeners, keyed by event name, so tests can fire them directly.
 * Named with a `mock` prefix so `jest.mock`'s factory (hoisted above this
 * module's other top-level code) is allowed to close over it.
 */
type Listener = (payload: unknown) => void;
const mockListeners = new Map<string, Listener>();

jest.mock('../../modules/watch-connectivity', () => {
  const mockModule = {
    isSupported: jest.fn(() => true),
    addListener: jest.fn((event: string, callback: Listener) => {
      mockListeners.set(event, callback);
      const remove = jest.fn(() => mockListeners.delete(event));
      return { remove };
    }),
  };
  return { __esModule: true, default: mockModule };
});

const mockUpdateWorkout = updateWorkout as jest.MockedFunction<
  typeof updateWorkout
>;
const mockAttachHeartRate = attachExerciseEntryHeartRate as jest.MockedFunction<
  typeof attachExerciseEntryHeartRate
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

function fire(event: string, payload: unknown) {
  mockListeners.get(event)?.(payload);
}

function makeSession(
  overrides: Partial<PresetSessionResponse> = {}
): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-09-17',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      {
        id: 'ex-uuid-1',
        exercise_id: 'ex-1',
        duration_minutes: 20,
        calories_burned: 150,
        entry_date: '2026-09-17',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          images: ['bench.jpg'],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: 10,
            weight: 60,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
    ],
    ...overrides,
  };
}

function getStore() {
  return useActiveWorkoutStore.getState();
}

describe('useWatchWorkoutBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    __resetActiveWorkoutStoreForTests();
    mockUpdateWorkout.mockImplementation(async () => getStore().session!);
    mockAttachHeartRate.mockResolvedValue(undefined);
  });

  it('subscribes to all three watch events when enabled', () => {
    renderHook(() => useWatchWorkoutBridge(true));
    expect(mockListeners.has('onSetCompleted')).toBe(true);
    expect(mockListeners.has('onHeartRateBatch')).toBe(true);
    expect(mockListeners.has('onWorkoutStop')).toBe(true);
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useWatchWorkoutBridge(false));
    expect(mockListeners.size).toBe(0);
  });

  it('completes the matching set and flushes the session on onSetCompleted', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
      });
      // Let the async handler's completeSet + saveActiveWorkoutSession settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getStore().completedSetIds['101']).toBeDefined();
    expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
  });

  it('applies weight and reps typed on the watch before completing the set', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        weightKg: 82.5,
        reps: 6,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const set = getStore().session!.exercises[0].sets[0];
    expect(set.weight).toBe(82.5);
    expect(set.reps).toBe(6);
    expect(getStore().completedSetIds['101']).toBeDefined();
  });

  it('leaves planned values alone when the watch sends none', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        weightKg: null,
        reps: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The fixture's planned 60kg x 10 survives rather than being nulled out.
    const set = getStore().session!.exercises[0].sets[0];
    expect(set.weight).toBe(60);
    expect(set.reps).toBe(10);
  });

  it('ignores a setCompleted for a session that is no longer active', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'stale-session',
        setId: '101',
      });
      await Promise.resolve();
    });

    expect(getStore().completedSetIds['101']).toBeUndefined();
    expect(mockUpdateWorkout).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('no matching active session'),
      'WARNING'
    );
  });

  it('dedupes a re-delivered setCompleted by clientId', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    const payload = {
      clientId: 'client-1',
      sessionId: 'session-1',
      setId: '101',
    };
    await act(async () => {
      fire('onSetCompleted', payload);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      fire('onSetCompleted', payload);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
  });

  it('buffers heart-rate batches for the matching session and attaches them on workoutStop', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
      // A batch for a session that no longer matches is dropped, not merged in.
      fire('onHeartRateBatch', {
        sessionId: 'other-session',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:20.000Z', bpm: 200 }],
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachHeartRate).toHaveBeenCalledWith('ex-uuid-1', [
      { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
      { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
    ]);
  });

  it('skips attaching heart rate for an exercise with fewer than two samples', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }],
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachHeartRate).not.toHaveBeenCalled();
  });

  it('clears the heart-rate buffer after a workoutStop', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    mockAttachHeartRate.mockClear();

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachHeartRate).not.toHaveBeenCalled();
  });
});
