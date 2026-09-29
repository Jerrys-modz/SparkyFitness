import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchSetTargetsSync } from '../../src/hooks/useWatchSetTargetsSync';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    updateSetTargets: jest.fn(),
  },
}));

const mockUpdateSetTargets = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { updateSetTargets: jest.Mock };
  }
).default.updateSetTargets;

function makeSet(id: number) {
  return {
    id,
    set_number: id,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    distance: null,
    rest_time: 90,
    notes: null,
    rpe: null,
  };
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    exercises: [
      {
        id: 'entry-1',
        exercise_id: 'ex-1',
        exercise_snapshot: { id: 'ex-1', name: 'Bench Press' },
        sets: [makeSet(101), makeSet(102)],
      },
    ],
  } as unknown as PresetSessionResponse;
}

const previousSets = [
  { setNumber: 1, setType: 'normal', weight: 100, reps: 8 },
  { setNumber: 2, setType: 'normal', weight: 100, reps: 8 },
];

describe('useWatchSetTargetsSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
  });

  it('sends the planned targets, then the progressed weight once history loads', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        weightUnit: 'lbs',
        plannedSetValues: {
          '101': { weight: 100, reps: 8, duration: null, distance: null },
          '102': { weight: 100, reps: 8, duration: null, distance: null },
        },
        exerciseConfigs: {
          'entry-1': {
            progression_mode: 'rep_goal',
            rep_goal: 16,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        },
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetTargets.mock.calls[0][0]).toMatchObject({
      sessionId: 'session-1',
      targets: [
        { setId: '101', targetWeightKg: 100, targetReps: 8 },
        { setId: '102', targetWeightKg: 100, targetReps: 8 },
      ],
    });

    act(() => {
      useActiveWorkoutStore.setState({
        previousSessionSets: { 'ex-1': previousSets },
      });
    });

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(2);
    const update = mockUpdateSetTargets.mock.calls[1][0];
    expect(update.targets).toEqual([
      { setId: '101', targetWeightKg: 102.5, targetReps: 8 },
      { setId: '102', targetWeightKg: 102.5, targetReps: 8 },
    ]);
    expect(update.revision).toBeGreaterThan(
      mockUpdateSetTargets.mock.calls[0][0].revision
    );
  });

  it('sends the sets logged on the phone, and again when one is logged', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].completedSetIds).toEqual([]);

    act(() => {
      useActiveWorkoutStore.setState({ completedSetIds: { '101': 1000 } });
    });

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(2);
    expect(mockUpdateSetTargets.mock.calls[1][0].completedSetIds).toEqual([
      '101',
    ]);
  });

  it("sends the phone's running rest, and omits it when none is running", () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0]).not.toHaveProperty(
      'restEndsAt'
    );

    act(() => {
      useActiveWorkoutStore.setState({
        completedSetIds: { '101': 1000 },
        rest: {
          state: 'resting',
          durationSec: 90,
          endsAt: 1_790_000_090_000,
          pausedRemainingMs: null,
          scheduledNotificationId: null,
          instanceToken: 1,
        },
      });
    });

    expect(mockUpdateSetTargets.mock.calls[1][0]).toMatchObject({
      completedSetIds: ['101'],
      restEndsAt: 1_790_000_090_000,
      restDurationSeconds: 90,
    });
  });

  it('does not resend when the resolved targets are unchanged', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);

    act(() => {
      useActiveWorkoutStore.setState({ declinedAdaptive: {} });
    });
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
  });

  it('prefers a value already entered on the phone and omits empty fields', () => {
    const session = makeSession();
    session.exercises[0].sets[0].weight = 110;
    act(() => {
      useActiveWorkoutStore.setState({ session, sessionId: 'session-1' });
    });
    renderHook(() => useWatchSetTargetsSync(true));

    expect(mockUpdateSetTargets.mock.calls[0][0].targets).toEqual([
      { setId: '101', targetWeightKg: 110 },
      { setId: '102', targetWeightKg: 110 },
    ]);
  });

  it('sends nothing while disabled or without a live preset session', () => {
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).not.toHaveBeenCalled();

    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
      });
    });
    renderHook(() => useWatchSetTargetsSync(false));
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
  });
});
