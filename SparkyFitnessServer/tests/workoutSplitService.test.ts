import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkoutSplit, workoutSplitExerciseIds } from '@workspace/shared';
import exerciseRepository from '../models/exerciseRepository.js';
import { addFreeExerciseDBExerciseToUserExercises } from '../services/exerciseService.js';
import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import workoutPresetService from '../services/workoutPresetService.js';
import {
  importWorkoutSplit,
  UnknownWorkoutSplitError,
  WorkoutSplitExercisesUnavailableError,
} from '../services/workoutSplitService.js';
import { ValidationError } from '../utils/errors.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseRepository.js', () => ({
  default: { getExerciseBySourceAndSourceId: vi.fn() },
}));
vi.mock('../services/exerciseService.js', () => ({
  addFreeExerciseDBExerciseToUserExercises: vi.fn(),
}));
vi.mock('../services/workoutPresetService.js', () => ({
  default: { createWorkoutPreset: vi.fn(), deleteWorkoutPreset: vi.fn() },
}));
vi.mock('../services/workoutPlanTemplateService.js', () => ({
  default: { createWorkoutPlanTemplate: vi.fn() },
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';
const SPLIT_ID = 'linear_5x5';

const getBySource = vi.mocked(
  exerciseRepository.getExerciseBySourceAndSourceId
);
const addExercise = vi.mocked(addFreeExerciseDBExerciseToUserExercises);
const createPreset = vi.mocked(workoutPresetService.createWorkoutPreset);
const deletePreset = vi.mocked(workoutPresetService.deleteWorkoutPreset);
const createPlan = vi.mocked(
  workoutPlanTemplateService.createWorkoutPlanTemplate
);

const split = getWorkoutSplit(SPLIT_ID)!;
const request = {
  planName: 'Starter 5x5',
  sessionNames: { workout_a: 'Workout A', workout_b: 'Workout B' },
  activate: true,
};

function libraryIdFor(exerciseId: string): string {
  return `lib-${exerciseId}`;
}

describe('importWorkoutSplit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getBySource.mockResolvedValue(undefined);
    addExercise.mockImplementation(async (_user, exerciseId) => ({
      id: libraryIdFor(exerciseId),
    }));
    let presetId = 100;
    createPreset.mockImplementation(async () => ({ id: ++presetId }));
    createPlan.mockResolvedValue({ id: 7 });
  });

  it('rejects an unknown split', async () => {
    await expect(
      importWorkoutSplit(USER_ID, 'nope', request)
    ).rejects.toBeInstanceOf(UnknownWorkoutSplitError);
    expect(addExercise).not.toHaveBeenCalled();
  });

  it('requires a name for every session', async () => {
    await expect(
      importWorkoutSplit(USER_ID, SPLIT_ID, {
        ...request,
        sessionNames: { workout_a: 'Workout A' },
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(addExercise).not.toHaveBeenCalled();
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('creates nothing and names every exercise it could not add', async () => {
    addExercise.mockImplementation(async (_user, exerciseId) => {
      if (exerciseId === 'Barbell_Squat' || exerciseId === 'Barbell_Deadlift') {
        throw new Error('provider down');
      }
      return { id: libraryIdFor(exerciseId) };
    });

    const error = await importWorkoutSplit(USER_ID, SPLIT_ID, request).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(WorkoutSplitExercisesUnavailableError);
    expect(
      (error as WorkoutSplitExercisesUnavailableError).missingExerciseIds
    ).toEqual(['Barbell_Squat', 'Barbell_Deadlift']);
    expect(createPreset).not.toHaveBeenCalled();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('adds only the exercises the library does not have yet', async () => {
    getBySource.mockImplementation(
      async (_source: string, exerciseId: string) =>
        exerciseId === 'Barbell_Squat' ? { id: 'already-there' } : undefined
    );

    const result = await importWorkoutSplit(USER_ID, SPLIT_ID, request);

    const total = workoutSplitExerciseIds(split).length;
    expect(addExercise).toHaveBeenCalledTimes(total - 1);
    expect(addExercise).not.toHaveBeenCalledWith(USER_ID, 'Barbell_Squat');
    expect(result.addedExerciseCount).toBe(total - 1);
    const firstPreset = createPreset.mock.calls[0][1];
    expect(firstPreset.exercises[0].exercise_id).toBe('already-there');
  });

  it('makes a preset per session and a sequential plan numbered from 1', async () => {
    const result = await importWorkoutSplit(USER_ID, SPLIT_ID, request);

    expect(result).toEqual({
      planId: 7,
      presetIds: { workout_a: 101, workout_b: 102 },
      addedExerciseCount: workoutSplitExerciseIds(split).length,
    });
    expect(createPreset.mock.calls.map(([, data]) => data.name)).toEqual([
      'Starter 5x5: Workout A',
      'Starter 5x5: Workout B',
    ]);
    const plan = createPlan.mock.calls[0][1];
    expect(plan).toMatchObject({
      plan_name: 'Starter 5x5',
      schedule_type: 'sequential',
      entry_mode: 'prompt',
      is_active: true,
    });
    // The repository stores a session index of 0 as null, so numbering is 1-based.
    expect(
      plan.assignments?.map((a) => [
        a.session_index,
        a.session_name,
        a.workout_preset_id,
      ])
    ).toEqual([
      [1, 'Workout A', 101],
      [2, 'Workout B', 102],
    ]);
  });

  it('writes the catalog sets, progression and a zero starting weight', async () => {
    await importWorkoutSplit(USER_ID, SPLIT_ID, request);

    const squat = createPreset.mock.calls[0][1].exercises[0];
    expect(squat).toMatchObject({
      exercise_id: libraryIdFor('Barbell_Squat'),
      progression_mode: 'fixed',
      increment_type: 'weight',
      increment_value: 5,
    });
    expect(squat.sets).toHaveLength(5);
    expect(squat.sets[0]).toMatchObject({
      set_number: 1,
      set_type: 'Working Set',
      reps: 5,
      weight: null,
    });
  });

  it('stores a hold as seconds, with no reps or weight step', async () => {
    await importWorkoutSplit(USER_ID, 'full_body_3_garage', {
      planName: 'Garage',
      sessionNames: { full_body_a: 'A', full_body_b: 'B' },
      activate: false,
    });

    const sessionA = createPreset.mock.calls[0][1];
    const plank = sessionA.exercises.find(
      (e: { exercise_id: string }) => e.exercise_id === libraryIdFor('Plank')
    );
    expect(plank.increment_value).toBeNull();
    expect(plank.sets[0]).toMatchObject({ reps: null, duration: 30 });
  });

  it('removes the presets it made when the plan cannot be created', async () => {
    createPlan.mockRejectedValue(new Error('db error'));

    await expect(
      importWorkoutSplit(USER_ID, SPLIT_ID, request)
    ).rejects.toThrow('db error');

    expect(deletePreset.mock.calls).toEqual([
      [USER_ID, 101],
      [USER_ID, 102],
    ]);
  });
});
