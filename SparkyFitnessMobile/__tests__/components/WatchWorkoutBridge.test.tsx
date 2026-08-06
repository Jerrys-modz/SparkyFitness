import { act, render, waitFor } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';

import WatchWorkoutBridge from '../../src/components/WatchWorkoutBridge';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { WatchConnectivity } from '../../src/services/watchConnectivity';
import { createWorkout } from '../../src/services/api/exerciseApi';
import { getActiveServerConfig } from '../../src/services/storage';
import { getTodayDate } from '../../src/utils/dateUtils';
import { createQueryWrapper, createTestQueryClient } from '../hooks/queryTestUtils';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

let mockCommandListener: ((command: unknown) => void) | undefined;

jest.mock('../../src/services/watchConnectivity', () => ({
  WatchConnectivity: {
    isAvailable: true,
    activate: jest.fn(),
    updateContext: jest.fn(() => Promise.resolve()),
    addCommandListener: jest.fn((listener: (command: unknown) => void) => {
      mockCommandListener = listener;
      return jest.fn();
    }),
    addReachabilityListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => false), navigate: jest.fn() },
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  createWorkout: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

// Full set the store itself needs (see __tests__/stores/activeWorkoutStore.test.ts)
// plus the two extra exports WatchWorkoutBridge's own start-workout flow uses.
jest.mock('../../src/services/notifications', () => ({
  ensureNotificationPermission: jest.fn(async () => true),
  maybePromptForExactAlarmPermission: jest.fn(async () => undefined),
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
  COMPLETE_SET_ACTION: 'complete-set',
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissDeliveredNotification: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfig: jest.fn(async () => ({ id: 'server-1' })),
}));

jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  flushActiveWorkoutBeforeClear: jest.fn(async () => true),
}));

const mockPreset: WorkoutPreset = {
  id: 42,
  user_id: 'user-1',
  name: 'Push Day',
  description: null,
  is_public: false,
  exercises: [
    {
      id: 1,
      exercise_id: 'ex-1',
      image_url: null,
      exercise_name: 'Bench Press',
      category: 'Strength',
      superset_group: null,
      sets: [
        {
          id: 1,
          set_number: 1,
          set_type: 'normal',
          reps: 8,
          weight: 60,
          duration: null,
          distance: null,
          rest_time: 90,
          notes: null,
        },
      ],
    },
  ],
};

jest.mock('../../src/hooks', () => ({
  usePreferences: jest.fn(() => ({ preferences: { default_weight_unit: 'kg' } })),
  useServerConnection: jest.fn(() => ({ isConnected: true })),
  useWorkoutPresets: jest.fn(() => ({ presets: [mockPreset] })),
}));

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: getTodayDate(),
    workout_preset_id: 42,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 0,
    activity_details: [],
    exercises: [
      {
        id: 'entry-1',
        exercise_id: 'ex-1',
        duration_minutes: 0,
        calories_burned: 0,
        entry_date: getTodayDate(),
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        superset_group: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          images: [],
        } as unknown as PresetSessionResponse['exercises'][number]['exercise_snapshot'],
        activity_details: [],
        sets: [
          {
            id: 501,
            set_number: 1,
            set_type: 'normal',
            reps: null,
            weight: null,
            duration: null,
            rest_time: 90,
            notes: null,
            rpe: null,
            completed_at: null,
            is_pr: false,
          },
        ],
      },
    ],
  } as unknown as PresetSessionResponse;
}

function renderBridge() {
  const queryClient = createTestQueryClient();
  return render(<WatchWorkoutBridge />, { wrapper: createQueryWrapper(queryClient) });
}

describe('WatchWorkoutBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    mockCommandListener = undefined;
    (createWorkout as jest.Mock).mockResolvedValue(makeSession());
  });

  it('activates WatchConnectivity and mirrors presets/connection state on mount', () => {
    renderBridge();

    expect(WatchConnectivity.activate).toHaveBeenCalledTimes(1);
    expect(WatchConnectivity.updateContext).toHaveBeenCalledWith(
      expect.objectContaining({
        presets: [{ id: 42, name: 'Push Day', exerciseCount: 1 }],
        serverConnected: true,
        activeWorkout: null,
      }),
    );
  });

  it('starts a preset workout on a startPreset command and seeds the store', async () => {
    renderBridge();
    expect(mockCommandListener).toBeDefined();

    await act(async () => {
      mockCommandListener?.({ type: 'startPreset', presetId: 42 });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useActiveWorkoutStore.getState().sessionId).toBe('session-1');
    });
    expect(createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Push Day', source: 'sparky' }),
    );
    expect(getActiveServerConfig).toHaveBeenCalled();
  });

  it('resyncs instead of starting a second workout when one is already live', async () => {
    renderBridge();
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'already-live' });
    });
    (WatchConnectivity.updateContext as jest.Mock).mockClear();

    await act(async () => {
      mockCommandListener?.({ type: 'startPreset', presetId: 42 });
      await Promise.resolve();
    });

    expect(createWorkout).not.toHaveBeenCalled();
    expect(WatchConnectivity.updateContext).toHaveBeenCalled();
  });

  it('logs a set with unit-converted weight and completes it', async () => {
    renderBridge();
    act(() => {
      __resetActiveWorkoutStoreForTests();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    act(() => {
      mockCommandListener?.({
        type: 'logSet',
        setId: '501',
        reps: 8,
        weight: 220.462, // ~100kg in lbs
        weightUnit: 'lbs',
      });
    });

    const set = useActiveWorkoutStore
      .getState()
      .session?.exercises[0].sets.find((s) => String(s.id) === '501');
    expect(set?.reps).toBe(8);
    expect(set?.weight).toBeCloseTo(100, 0);
    expect(useActiveWorkoutStore.getState().completedSetIds['501']).toBeDefined();
  });

  it('dismisses rest on a skipRest command', async () => {
    renderBridge();
    const dismissRestSpy = jest.spyOn(useActiveWorkoutStore.getState(), 'dismissRest');

    act(() => {
      mockCommandListener?.({ type: 'skipRest' });
    });

    expect(dismissRestSpy).toHaveBeenCalledTimes(1);
  });

  it('adjusts rest by the requested delta on an adjustRest command', async () => {
    renderBridge();
    const adjustRestSpy = jest.spyOn(useActiveWorkoutStore.getState(), 'adjustRest');

    act(() => {
      mockCommandListener?.({ type: 'adjustRest', deltaSec: 15 });
    });

    expect(adjustRestSpy).toHaveBeenCalledWith(15);
  });

  it('flushes and clears the workout on a finishWorkout command', async () => {
    renderBridge();
    const clearWorkoutSpy = jest.spyOn(useActiveWorkoutStore.getState(), 'clearWorkout');

    await act(async () => {
      mockCommandListener?.({ type: 'finishWorkout' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(clearWorkoutSpy).toHaveBeenCalledTimes(1);
  });

  it('re-sends the current context on a requestSync command', async () => {
    renderBridge();
    (WatchConnectivity.updateContext as jest.Mock).mockClear();

    act(() => {
      mockCommandListener?.({ type: 'requestSync' });
    });

    expect(WatchConnectivity.updateContext).toHaveBeenCalledTimes(1);
  });
});
