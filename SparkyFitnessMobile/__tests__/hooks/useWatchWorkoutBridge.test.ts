import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchWorkoutBridge } from '../../src/hooks/useWatchWorkoutBridge';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  updateWorkout,
  attachExerciseEntryWatchTelemetry,
} from '../../src/services/api/exerciseApi';
import { addLog } from '../../src/services/LogService';
import { ApiError } from '../../src/services/api/errors';

jest.mock('../../src/services/api/exerciseApi', () => ({
  updateWorkout: jest.fn(),
  attachExerciseEntryWatchTelemetry: jest.fn(),
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
    stopWorkout: jest.fn(),
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
const mockAttachTelemetry =
  attachExerciseEntryWatchTelemetry as jest.MockedFunction<
    typeof attachExerciseEntryWatchTelemetry
  >;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockStopWorkout = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { stopWorkout: jest.Mock };
  }
).default.stopWorkout;

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
    mockAttachTelemetry.mockResolvedValue(undefined);
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

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
    });
    expect(getStore().sessionId).toBeNull();
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

    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('does not re-attach an unchanged buffer on a second workoutStop', async () => {
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
    mockAttachTelemetry.mockClear();

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('attaches heart rate and stops the watch when the phone ends the workout', async () => {
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

    // The watch never sends workoutStop here — the wearer finished on the
    // phone, which is the common case and the one that used to strand the
    // buffered samples entirely.
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });

    expect(mockStopWorkout).toHaveBeenCalledWith('session-1');
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
    });
  });

  it('sums the per-batch energy deltas into one measured calorie figure', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 12.5,
      });
      fire('onHeartRateBatch', {
        clientId: 'hr-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:01:00.000Z', bpm: 131 }],
        activeEnergyKcal: 7.5,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:01:00.000Z', bpm: 131 },
      ],
      activeEnergyKcal: 20,
    });
  });

  it('posts measured energy even when the series is too short to zone', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-energy-only',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }],
        activeEnergyKcal: 9,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    // hrSamples omitted — one reading spans no time, so there is nothing to
    // bucket into zones — but the calories the watch measured still land.
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      activeEnergyKcal: 9,
    });
  });

  it('does not double-attach when the watch reports a stop the phone already handled', async () => {
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
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    // The queued workoutStop lands afterwards. The buffer still holds the
    // samples — it is kept so a late batch can re-post the full series — but
    // nothing has arrived since the last attach, so there is nothing to send.
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
  });

  it("re-posts the whole series when the watch's final batch lands after the phone finished", async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-late-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 40,
      });
    });

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    // The watch answers the phone's stop signal with whatever HealthKit was
    // still holding — always after the session has already ended here.
    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-late-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
          { t: '2026-09-17T10:00:30.000Z', bpm: 141 },
        ],
        activeEnergyKcal: 7,
      });
      await Promise.resolve();
    });

    // The second post carries the FULL series and the FULL energy, not the
    // tail: the server derives avg/max, calories and the zone rows from
    // whatever one post contains, so a tail-only correction would overwrite
    // the workout's figures with its last minute's.
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
    expect(mockAttachTelemetry).toHaveBeenLastCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
        { t: '2026-09-17T10:00:30.000Z', bpm: 141 },
      ],
      activeEnergyKcal: 47,
    });
  });

  it('attaches a final batch for a workout too short to have sent one earlier', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    // Batches are a minute apart, so a workout ended before the first one
    // fires reaches here with the buffer never having seen this session.
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-short',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 118 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 124 },
        ],
        activeEnergyKcal: 9,
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 118 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 124 },
      ],
      activeEnergyKcal: 9,
    });
  });

  it('ignores a batch for a workout that was never this session', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onHeartRateBatch', {
        sessionId: 'session-from-another-phone',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('dedupes a re-delivered heart-rate batch by clientId so calories do not double', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    const payload = {
      clientId: 'hr-redeliver',
      sessionId: 'session-1',
      exerciseEntryId: 'ex-uuid-1',
      samples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    };
    act(() => {
      fire('onHeartRateBatch', payload);
      fire('onHeartRateBatch', payload);
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    });
  });

  it('skips energy on a batch with no clientId so a redelivery cannot double calories', async () => {
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
        activeEnergyKcal: 12.5,
      });
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
          { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
        ],
        activeEnergyKcal: 7.5,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    // Samples still merge (timestamp-deduped); energy is refused without a
    // clientId because transferUserInfo can redeliver the same delta.
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
      ],
    });
  });

  it('stays subscribed while the server is offline and flushes when it returns', async () => {
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected),
      { initialProps: { connected: false } }
    );
    expect(mockListeners.has('onSetCompleted')).toBe(true);
    expect(mockListeners.has('onHeartRateBatch')).toBe(true);
    expect(mockListeners.has('onWorkoutStop')).toBe(true);

    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-offline',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 12.5,
      });
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ connected: true });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    });
  });

  it('reports unposted telemetry so the phone only polls while a flush is outstanding', async () => {
    const onPending = jest.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected, onPending),
      { initialProps: { connected: false } }
    );

    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-pending',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 4,
      });
    });
    expect(onPending).toHaveBeenCalledWith(true);
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ connected: true });
      await Promise.resolve();
    });
    expect(onPending).toHaveBeenLastCalledWith(false);
  });
});

describe('useWatchWorkoutBridge across sessions, failures and watch finishes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    __resetActiveWorkoutStoreForTests();
    mockUpdateWorkout.mockImplementation(async () => getStore().session!);
    mockAttachTelemetry.mockResolvedValue(undefined);
  });

  const twoSamples = [
    { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
    { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
  ];

  it("still attaches a workout's final batch after the next workout has already started", async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    // Finished on the phone with nothing from the watch yet…
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    // …and a new workout started before the watch's queued drain arrived.
    act(() => {
      getStore().startWorkout(
        makeSession({ id: 'session-2', entry_date: '2026-09-17' })
      );
    });
    expect(getStore().sessionId).toBe('session-2');

    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-drain-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
        activeEnergyKcal: 12,
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: twoSamples,
      activeEnergyKcal: 12,
    });
  });

  it('drops an entry the server permanently rejects instead of retrying it forever', async () => {
    const onPending = jest.fn();
    renderHook(() => useWatchWorkoutBridge(true, true, onPending));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-404',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      });
    });
    mockAttachTelemetry.mockRejectedValueOnce(
      new ApiError('Server error: 404 - not found', 404)
    );

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('server rejected it (404)'),
      'WARNING',
      expect.any(Array)
    );

    // Nothing left to post: another stop does not ask the server again.
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying after a server fault', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-500',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      });
    });
    mockAttachTelemetry.mockRejectedValueOnce(
      new ApiError('Server error: 500 - boom', 500)
    );

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
  });

  it.each([401, 408, 429])(
    'keeps telemetry for a retryable %i instead of dropping it',
    async (status) => {
      renderHook(() => useWatchWorkoutBridge(true));
      act(() => {
        getStore().startWorkout(makeSession());
      });
      act(() => {
        fire('onHeartRateBatch', {
          clientId: `hr-${status}`,
          sessionId: 'session-1',
          exerciseEntryId: 'ex-uuid-1',
          samples: twoSamples,
        });
      });
      mockAttachTelemetry.mockRejectedValueOnce(
        new ApiError(`Server error: ${status}`, status)
      );

      await act(async () => {
        getStore().clearWorkout();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

      await act(async () => {
        fire('onWorkoutStop', { sessionId: 'session-1' });
        await Promise.resolve();
      });
      expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the phone workout open when a watch finish cannot save it', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    mockUpdateWorkout.mockRejectedValue(new Error('offline'));
    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'set-offline',
        sessionId: 'session-1',
        setId: '101',
      });
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(getStore().sessionId).toBe('session-1');
    expect(getStore().completedSetIds).toHaveProperty('101');
    expect(onWatchFinished).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('kept the phone workout open'),
      'WARNING'
    );
  });

  it('logs a batch for a session it has no record of instead of dropping it silently', () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-stranger',
        sessionId: 'session-unknown',
        exerciseEntryId: 'ex-uuid-9',
        samples: twoSamples,
      });
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('unknown session session-unknown'),
      'WARNING',
      expect.any(Array)
    );
  });

  it('ends the phone workout and hands the completion params over when the wearer finishes on the watch', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'set-1',
        sessionId: 'session-1',
        setId: '101',
      });
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(getStore().sessionId).toBeNull();
    expect(onWatchFinished).toHaveBeenCalledTimes(1);
    const celebration = onWatchFinished.mock.calls[0][0];
    expect(celebration?.session.id).toBe('session-1');
    expect(Object.keys(celebration?.completedSetIds ?? {})).toEqual(['101']);
  });

  it('does not report a watch finish for a stop the phone already handled', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(onWatchFinished).not.toHaveBeenCalled();
  });
});
