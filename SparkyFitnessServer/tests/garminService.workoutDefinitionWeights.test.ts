import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { processGarminWorkoutDefinition } from '../services/garminService.js';
import { assertSetWeightSign } from '../utils/setWeightSign.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    updateExercise: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { createExerciseEntry: vi.fn() },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: { createExercisePresetEntry: vi.fn() },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
    createWorkoutPreset: vi.fn(),
    addExerciseToWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../services/measurementService.js', () => ({ default: {} }));
vi.mock('../models/moodRepository.js', () => ({ default: {} }));
vi.mock('../integrations/garminconnect/garminConnectService.js', () => ({
  default: {},
}));
vi.mock('../integrations/garminconnect/garminMeasurementMapping.js', () => ({
  default: {},
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/sleepRepository.js', () => ({ default: {} }));
vi.mock('../models/food.js', () => ({ default: {} }));
vi.mock('../models/foodEntry.js', () => ({ default: {} }));
vi.mock('../models/mealType.js', () => ({ default: {} }));

const UID = 'user-1';

function buildWorkoutData(weightUnitKey: string | undefined) {
  return {
    workoutName: 'Strength Plan',
    workoutSegments: [
      {
        workoutSteps: [
          {
            type: 'ExecutableStepDTO',
            exerciseName: 'BENCH_PRESS',
            category: 'BENCH_PRESS',
            stepType: { stepTypeKey: 'Working Set' },
            endConditionValue: 5,
            weightValue: 100,
            ...(weightUnitKey
              ? { weightUnit: { unitKey: weightUnitKey } }
              : {}),
          },
        ],
      },
    ],
  };
}

function capturedSetWeight() {
  const call = vi.mocked(workoutPresetRepository.addExerciseToWorkoutPreset)
    .mock.calls[0];
  // addExerciseToWorkoutPreset(userId, presetId, exerciseId, null, sets, order)
  return call[4][0].weight;
}

describe('processGarminWorkoutDefinition set weights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      {
        id: 'exercise-1',
        name: 'Bench Press',
        category: 'strength',
      }
    );
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      {
        id: 7,
      }
    );
  });

  it('converts pound-denominated step weights to kg', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData('pound'));
    expect(capturedSetWeight()).toBeCloseTo(45.36, 2);
  });

  it('stores kilogram-denominated step weights unchanged', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData('kilogram'));
    expect(capturedSetWeight()).toBe(100);
  });

  it('treats a missing weightUnit as kilograms rather than pounds', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData(undefined));
    expect(capturedSetWeight()).toBe(100);
  });
});

// Garmin sends weightValue -1.0 on workout steps that have no weight set.
function buildNoWeightWorkout(weightUnitKey: string) {
  return {
    workoutName: 'Bodyweight Plan',
    workoutSegments: [
      {
        workoutSteps: [
          {
            type: 'ExecutableStepDTO',
            exerciseName: 'PUSH_UP',
            category: 'PUSH_UP',
            stepType: { stepTypeKey: 'interval' },
            endConditionValue: 10,
            weightValue: -1.0,
            weightUnit: { unitKey: weightUnitKey },
          },
        ],
      },
    ],
  };
}

describe('processGarminWorkoutDefinition with Garmin "no weight" placeholder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      { id: 'exercise-1', name: 'Push Up', category: 'strength' }
    );
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: 33 }
    );
    // Mirror the real repository: it validates the sets against the
    // exercise's modality before inserting. Garmin-created exercises are
    // never bodyweight, so use weight_reps here.
    vi.mocked(
      workoutPresetRepository.addExerciseToWorkoutPreset
    ).mockImplementation(async (_u, _p, _e, _i, sets) => {
      assertSetWeightSign(sets, 'weight_reps');
      return 'preset-exercise-1';
    });
  });

  it.each(['kilogram', 'pound'])(
    'stores weight 0 and does not throw for weightValue -1 (%s)',
    async (unitKey) => {
      await expect(
        processGarminWorkoutDefinition(UID, buildNoWeightWorkout(unitKey))
      ).resolves.not.toThrow();
      const sets = vi.mocked(workoutPresetRepository.addExerciseToWorkoutPreset)
        .mock.calls[0][4];
      expect(sets[0].weight).toBe(0);
    }
  );
});
