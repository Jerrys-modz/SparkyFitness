import { renderHook, waitFor } from '@testing-library/react-native';
import { useWatchWorkoutStart } from '../../src/hooks/useWatchWorkoutStart';
import { fetchActiveWorkoutPlans } from '../../src/services/api/workoutPlansApi';
import { getWorkoutPresetById } from '../../src/services/api/workoutPresetsApi';

let handler: ((p: { presetId: string; serverId: string }) => void) | null =
  null;
jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    addListener: jest.fn((_e: string, cb: typeof handler) => {
      handler = cb;
      return { remove: jest.fn() };
    }),
  },
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 'srv'),
}));
jest.mock('../../src/services/api/workoutPlansApi', () => ({
  fetchActiveWorkoutPlans: jest.fn(),
}));
jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  getWorkoutPresetById: jest.fn(),
}));

const preset = {
  id: 42,
  name: 'Upper',
  workout_format: 'standard',
  time_cap_seconds: null,
  exercises: [
    {
      exercise_id: 'e1',
      sort_order: 0,
      sets: [{ set_number: 1, set_type: 'normal', reps: 5 }],
    },
  ],
};

function plan(presetId: string) {
  const a = { id: '7', workout_preset_id: presetId, sets: [] };
  return {
    id: 'p1',
    plan_name: 'Plan',
    schedule_type: 'weekly',
    assignments: [a],
    next_assignment: a,
    next_assignments: [a],
  };
}

async function fire() {
  const start = jest.fn(async () => {});
  renderHook(() => useWatchWorkoutStart(true, true, start));
  handler?.({ presetId: '42', serverId: 'srv' });
  await waitFor(() => expect(start).toHaveBeenCalled());
  return start.mock.calls[0]![0] as unknown as {
    workoutPlanAssignmentId?: number;
    exercises: { workout_plan_assignment_id?: number }[];
  };
}

describe('useWatchWorkoutStart plan link', () => {
  beforeEach(() => {
    (getWorkoutPresetById as jest.Mock).mockResolvedValue(preset);
  });

  it('links the session to the plan assignment due for the preset', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([plan('42')]);
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBe(7);
    expect(args.exercises[0]!.workout_plan_assignment_id).toBe(7);
  });

  it('starts the preset plain when no plan is due or plans fail to load', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockRejectedValue(new Error('x'));
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBeUndefined();
    expect(args.exercises[0]!.workout_plan_assignment_id).toBeUndefined();
  });
});
