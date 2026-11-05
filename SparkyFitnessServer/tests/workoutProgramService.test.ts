import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  workoutProgramFileSchema,
  type WorkoutProgramFile,
} from '@workspace/shared';
import exerciseRepository from '../models/exerciseRepository.js';
import { addFreeExerciseDBExerciseToUserExercises } from '../services/exerciseService.js';
import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import workoutPresetService from '../services/workoutPresetService.js';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
  WorkoutProgramExercisesUnavailableError,
  WorkoutProgramNotFoundError,
} from '../services/workoutProgramService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseRepository.js', () => ({
  default: {
    getExerciseById: vi.fn(),
    getExerciseBySourceAndSourceId: vi.fn(),
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../services/exerciseService.js', () => ({
  addFreeExerciseDBExerciseToUserExercises: vi.fn(),
}));
vi.mock('../services/workoutPresetService.js', () => ({
  default: {
    getWorkoutPresetById: vi.fn(),
    createWorkoutPreset: vi.fn(),
    deleteWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../services/workoutPlanTemplateService.js', () => ({
  default: {
    getWorkoutPlanTemplateById: vi.fn(),
    createWorkoutPlanTemplate: vi.fn(),
  },
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_USER = '88888888-8888-4888-8888-888888888888';

const getExercise = vi.mocked(exerciseRepository.getExerciseById);
const getBySource = vi.mocked(
  exerciseRepository.getExerciseBySourceAndSourceId
);
const findByName = vi.mocked(exerciseRepository.findExerciseByNameAndUserId);
const createExercise = vi.mocked(exerciseRepository.createExercise);
const addFromDb = vi.mocked(addFreeExerciseDBExerciseToUserExercises);
const getPreset = vi.mocked(workoutPresetService.getWorkoutPresetById);
const createPreset = vi.mocked(workoutPresetService.createWorkoutPreset);
const deletePreset = vi.mocked(workoutPresetService.deleteWorkoutPreset);
const getPlan = vi.mocked(
  workoutPlanTemplateService.getWorkoutPlanTemplateById
);
const createPlan = vi.mocked(
  workoutPlanTemplateService.createWorkoutPlanTemplate
);

const exerciseRows: Record<string, object> = {
  'uuid-squat': {
    id: 'uuid-squat',
    source: 'free-exercise-db',
    source_id: 'Barbell_Squat',
    name: 'Barbell Squat',
    category: 'strength',
    modality: 'weight_reps',
    equipment: '["barbell"]',
    primary_muscles: '["quadriceps"]',
    secondary_muscles: null,
    instructions: '["Squat down."]',
    calories_per_hour: '400',
    user_id: USER_ID,
  },
  'uuid-band': {
    id: 'uuid-band',
    source: 'custom',
    source_id: null,
    name: 'Band Pull Apart',
    category: 'strength',
    equipment: ['bands'],
    primary_muscles: ['shoulders'],
    user_id: USER_ID,
  },
};

const presetRow = {
  id: 11,
  user_id: USER_ID,
  name: 'Leg Day',
  description: 'Heavy',
  workout_format: 'standard',
  time_cap_seconds: null,
  exercises: [
    {
      id: 1,
      exercise_id: 'uuid-squat',
      superset_group: null,
      progression_mode: 'fixed',
      rep_goal: null,
      increment_type: 'weight',
      increment_value: '2.50',
      ramp_increment: null,
      sets: [
        {
          id: 5,
          set_number: 1,
          set_type: 'Working Set',
          reps: 5,
          weight: '100.00',
          duration: null,
          distance: null,
          rest_time: 180,
          notes: null,
        },
      ],
    },
    {
      id: 2,
      exercise_id: 'uuid-band',
      superset_group: 1,
      progression_mode: 'manual',
      sets: [],
    },
  ],
};

function minimalFile(
  overrides: Partial<WorkoutProgramFile> = {}
): WorkoutProgramFile {
  return {
    format: WORKOUT_PROGRAM_FILE_FORMAT,
    version: WORKOUT_PROGRAM_FILE_VERSION,
    exercises: [
      {
        key: 'e1',
        name: 'Barbell Squat',
        source: 'free-exercise-db',
        sourceId: 'Barbell_Squat',
      },
      { key: 'e2', name: 'Band Pull Apart', source: 'custom' },
    ],
    presets: [
      {
        key: 'p1',
        name: 'Leg Day',
        workoutFormat: 'standard',
        exercises: [
          {
            exercise: 'e1',
            progressionMode: 'fixed',
            incrementType: 'weight',
            incrementValue: 2.5,
            sets: [{ setNumber: 1, reps: 5, weight: 100 }],
          },
          { exercise: 'e2', sets: [{ setNumber: 1, reps: 15 }] },
        ],
      },
    ],
    plan: {
      name: 'Shared plan',
      scheduleType: 'weekly',
      entryMode: 'prompt',
      sessions: [
        { dayOfWeek: 1, preset: 'p1' },
        { dayOfWeek: 3, exercise: 'e2', sets: [{ setNumber: 1, reps: 20 }] },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  getExercise.mockImplementation(async (id: string) => exerciseRows[id]);
  getPreset.mockResolvedValue(presetRow);
  let presetId = 200;
  createPreset.mockImplementation(async () => ({ id: ++presetId }));
  createPlan.mockResolvedValue({ id: 9 });
});

describe('exportWorkoutPreset', () => {
  it('writes a valid file with exercise definitions and no ids', async () => {
    const file = await exportWorkoutPreset(USER_ID, 11);

    expect(workoutProgramFileSchema.safeParse(file).success).toBe(true);
    expect(file.plan).toBeNull();
    expect(file.exercises).toEqual([
      expect.objectContaining({
        key: 'e1',
        name: 'Barbell Squat',
        source: 'free-exercise-db',
        sourceId: 'Barbell_Squat',
        equipment: ['barbell'],
        primaryMuscles: ['quadriceps'],
        instructions: ['Squat down.'],
        caloriesPerHour: 400,
      }),
      expect.objectContaining({
        key: 'e2',
        name: 'Band Pull Apart',
        equipment: ['bands'],
      }),
    ]);
    expect(file.presets[0]).toMatchObject({
      key: 'p1',
      name: 'Leg Day',
      exercises: [
        {
          exercise: 'e1',
          incrementValue: 2.5,
          sets: [{ setNumber: 1, reps: 5, weight: 100, restTime: 180 }],
        },
        { exercise: 'e2', supersetGroup: 1 },
      ],
    });
    const text = JSON.stringify(file);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain('uuid-squat');
  });

  it('is a not-found error when the preset cannot be seen', async () => {
    getPreset.mockRejectedValue(new Error('Workout preset not found.'));
    await expect(exportWorkoutPreset(USER_ID, 11)).rejects.toBeInstanceOf(
      WorkoutProgramNotFoundError
    );
  });
});

describe('exportWorkoutPlan', () => {
  it('includes each preset once and keeps single-exercise sessions', async () => {
    getPlan.mockResolvedValue({
      id: 3,
      plan_name: 'My Week',
      description: null,
      schedule_type: 'weekly',
      entry_mode: 'prefill',
      assignments: [
        { id: 1, day_of_week: 1, workout_preset_id: 11, session_name: null },
        { id: 2, day_of_week: 4, workout_preset_id: 11, session_name: null },
        {
          id: 3,
          day_of_week: 5,
          exercise_id: 'uuid-band',
          sets: [{ set_number: 1, reps: 20 }],
        },
      ],
    });

    const file = await exportWorkoutPlan(USER_ID, 3);

    expect(workoutProgramFileSchema.safeParse(file).success).toBe(true);
    expect(getPreset).toHaveBeenCalledTimes(1);
    expect(file.presets).toHaveLength(1);
    expect(file.plan).toMatchObject({
      name: 'My Week',
      scheduleType: 'weekly',
      entryMode: 'prefill',
      sessions: [
        { dayOfWeek: 1, preset: 'p1' },
        { dayOfWeek: 4, preset: 'p1' },
        { dayOfWeek: 5, exercise: 'e2', sets: [{ setNumber: 1, reps: 20 }] },
      ],
    });
  });

  it('is a not-found error when the plan cannot be seen', async () => {
    getPlan.mockRejectedValue(new Error('Workout plan template not found.'));
    await expect(exportWorkoutPlan(USER_ID, 3)).rejects.toBeInstanceOf(
      WorkoutProgramNotFoundError
    );
  });
});

describe('importWorkoutProgram', () => {
  it('adds exercises, private presets and the plan', async () => {
    getBySource.mockResolvedValue(undefined);
    addFromDb.mockResolvedValue({ id: 'lib-squat' });
    findByName.mockResolvedValue(undefined);
    createExercise.mockResolvedValue({ id: 'lib-band' });

    const result = await importWorkoutProgram(USER_ID, minimalFile(), {
      activate: true,
      allowCustomExercises: true,
    });

    expect(result).toEqual({
      planId: 9,
      presetIds: { p1: 201 },
      addedExerciseCount: 2,
    });
    expect(addFromDb).toHaveBeenCalledWith(USER_ID, 'Barbell_Squat');
    expect(createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        name: 'Band Pull Apart',
        source: 'custom',
        is_custom: true,
        shared_with_public: false,
      })
    );
    const preset = createPreset.mock.calls[0][1];
    expect(preset).toMatchObject({ name: 'Leg Day', is_public: false });
    expect(
      preset.exercises.map((e: { exercise_id: string }) => e.exercise_id)
    ).toEqual(['lib-squat', 'lib-band']);
    expect(preset.exercises[0].sets[0]).toMatchObject({
      set_number: 1,
      reps: 5,
      weight: 100,
    });
    const plan = createPlan.mock.calls[0][1];
    expect(plan).toMatchObject({
      plan_name: 'Shared plan',
      is_active: true,
      schedule_type: 'weekly',
    });
    expect(plan.assignments).toEqual([
      expect.objectContaining({
        day_of_week: 1,
        session_index: null,
        workout_preset_id: 201,
        exercise_id: null,
      }),
      expect.objectContaining({
        day_of_week: 3,
        workout_preset_id: null,
        exercise_id: 'lib-band',
        sets: [expect.objectContaining({ set_number: 1, reps: 20 })],
      }),
    ]);
  });

  it('reuses library exercises and only the person’s own name match', async () => {
    getBySource.mockResolvedValue({ id: 'existing-squat' });
    findByName.mockResolvedValue({ id: 'someone-elses', user_id: OTHER_USER });
    createExercise.mockResolvedValue({ id: 'lib-band' });

    const result = await importWorkoutProgram(USER_ID, minimalFile(), {
      activate: false,
      allowCustomExercises: true,
    });

    expect(addFromDb).not.toHaveBeenCalled();
    expect(createExercise).toHaveBeenCalledTimes(1);
    expect(result.addedExerciseCount).toBe(1);

    findByName.mockResolvedValue({ id: 'my-band', user_id: USER_ID });
    createExercise.mockClear();
    await importWorkoutProgram(USER_ID, minimalFile(), {
      activate: false,
      allowCustomExercises: true,
    });
    expect(createExercise).not.toHaveBeenCalled();
  });

  it('builds an unreachable database exercise as custom when allowed', async () => {
    getBySource.mockResolvedValue(undefined);
    addFromDb.mockRejectedValue(new Error('provider down'));
    findByName.mockResolvedValue(undefined);
    createExercise.mockImplementation(async (data: { name: string }) => ({
      id: `custom-${data.name}`,
    }));

    await importWorkoutProgram(USER_ID, minimalFile(), {
      activate: false,
      allowCustomExercises: true,
    });

    expect(createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Barbell Squat', source: 'custom' })
    );
  });

  it('creates nothing when the database is down and custom is not allowed', async () => {
    getBySource.mockResolvedValue(undefined);
    addFromDb.mockRejectedValue(new Error('provider down'));
    findByName.mockResolvedValue(undefined);
    createExercise.mockResolvedValue({ id: 'lib-band' });

    const error = await importWorkoutProgram(USER_ID, minimalFile(), {
      activate: false,
      allowCustomExercises: false,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WorkoutProgramExercisesUnavailableError);
    expect(
      (error as WorkoutProgramExercisesUnavailableError).missingExerciseIds
    ).toEqual(['Barbell_Squat']);
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('uses the given plan name and imports presets-only files', async () => {
    getBySource.mockResolvedValue({ id: 'lib-squat' });
    findByName.mockResolvedValue({ id: 'lib-band', user_id: USER_ID });

    await importWorkoutProgram(USER_ID, minimalFile(), {
      planName: 'Renamed',
      activate: false,
      allowCustomExercises: true,
    });
    expect(createPlan.mock.calls[0][1].plan_name).toBe('Renamed');

    createPlan.mockClear();
    const result = await importWorkoutProgram(
      USER_ID,
      minimalFile({ plan: null }),
      { activate: false, allowCustomExercises: true }
    );
    expect(createPlan).not.toHaveBeenCalled();
    expect(result.planId).toBeNull();
  });

  it('removes the presets it made when the plan fails', async () => {
    getBySource.mockResolvedValue({ id: 'lib-squat' });
    findByName.mockResolvedValue({ id: 'lib-band', user_id: USER_ID });
    createPlan.mockRejectedValue(new Error('db error'));

    await expect(
      importWorkoutProgram(USER_ID, minimalFile(), {
        activate: false,
        allowCustomExercises: true,
      })
    ).rejects.toThrow('db error');
    expect(deletePreset.mock.calls).toEqual([[USER_ID, 201]]);
  });
});

describe('workoutProgramFileSchema', () => {
  it('rejects keys that point nowhere', () => {
    const file = minimalFile();
    file.presets[0].exercises[0].exercise = 'missing';
    expect(workoutProgramFileSchema.safeParse(file).success).toBe(false);
  });

  it('rejects a session with both a preset and an exercise', () => {
    const file = minimalFile();
    file.plan!.sessions[0] = { dayOfWeek: 1, preset: 'p1', exercise: 'e1' };
    expect(workoutProgramFileSchema.safeParse(file).success).toBe(false);
  });

  it('rejects another format', () => {
    expect(
      workoutProgramFileSchema.safeParse({ ...minimalFile(), format: 'x' })
        .success
    ).toBe(false);
  });
});
