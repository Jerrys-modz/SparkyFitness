import {
  getWorkoutSplit,
  type ImportWorkoutSplitRequest,
  type ImportWorkoutSplitResponse,
  type WorkoutSplit,
  type WorkoutSplitExercise,
  workoutSplitExerciseIds,
} from '@workspace/shared';
import exerciseRepository from '../models/exerciseRepository.js';
import { log } from '../config/logging.js';
import { describeError, ValidationError } from '../utils/errors.js';
import { addFreeExerciseDBExerciseToUserExercises } from './exerciseService.js';
import workoutPlanTemplateService from './workoutPlanTemplateService.js';
import workoutPresetService from './workoutPresetService.js';

const WORKING_SET = 'Working Set';
const FREE_EXERCISE_DB = 'free-exercise-db';

export class UnknownWorkoutSplitError extends Error {
  constructor(splitId: string) {
    super(`Unknown workout split "${splitId}".`);
    this.name = 'UnknownWorkoutSplitError';
  }
}

/** Some of the split's exercises could not be added; nothing was created. */
export class WorkoutSplitExercisesUnavailableError extends Error {
  readonly missingExerciseIds: string[];
  constructor(missingExerciseIds: string[]) {
    super(
      'Some exercises could not be added from the exercise database. Try again when it is reachable.'
    );
    this.name = 'WorkoutSplitExercisesUnavailableError';
    this.missingExerciseIds = missingExerciseIds;
  }
}

interface CreatedRow {
  id: number;
}

function assertSessionNames(
  split: WorkoutSplit,
  sessionNames: Record<string, string>
): void {
  const missing = split.sessions
    .map((session) => session.id)
    .filter((id) => !sessionNames[id]);
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing a name for session ${missing.join(', ')}.`
    );
  }
}

/**
 * The person's library exercise for each free-exercise-db id, adding the ones
 * not there yet. Adding is idempotent, so a retry after a failure only
 * fetches what is still missing. All ids are tried before giving up so the
 * error can name every one that failed.
 */
async function ensureLibraryExercises(
  userId: string,
  exerciseIds: string[]
): Promise<{ libraryIds: Map<string, string>; addedCount: number }> {
  const libraryIds = new Map<string, string>();
  const missing: string[] = [];
  let addedCount = 0;
  for (const exerciseId of exerciseIds) {
    try {
      const existing = await exerciseRepository.getExerciseBySourceAndSourceId(
        FREE_EXERCISE_DB,
        exerciseId,
        userId
      );
      if (existing) {
        libraryIds.set(exerciseId, existing.id);
        continue;
      }
      const added = await addFreeExerciseDBExerciseToUserExercises(
        userId,
        exerciseId
      );
      libraryIds.set(exerciseId, added.id);
      addedCount += 1;
    } catch (error) {
      log(
        'warn',
        `Workout split import: could not add free-exercise-db exercise ${exerciseId}: ${describeError(error)}`
      );
      missing.push(exerciseId);
    }
  }
  if (missing.length > 0) {
    throw new WorkoutSplitExercisesUnavailableError(missing);
  }
  return { libraryIds, addedCount };
}

function presetExercise(
  exercise: WorkoutSplitExercise,
  libraryId: string,
  sortOrder: number
) {
  const sets = Array.from({ length: exercise.sets }, (_, index) => ({
    set_number: index + 1,
    set_type: WORKING_SET,
    reps: exercise.durationSeconds === undefined ? exercise.reps : null,
    weight: null,
    duration: exercise.durationSeconds ?? null,
  }));
  return {
    exercise_id: libraryId,
    sort_order: sortOrder,
    superset_group: exercise.supersetGroup ?? null,
    progression_mode: exercise.progressionMode,
    rep_goal: exercise.durationSeconds === undefined ? exercise.repGoal : null,
    increment_type: 'weight' as const,
    // Kept null for a hold: the schema wants a positive value when it is set.
    increment_value: exercise.incrementKg > 0 ? exercise.incrementKg : null,
    sets,
  };
}

/**
 * Makes the person's own copy of a built-in split: its exercises are added to
 * the library from free-exercise-db, each session becomes a preset and the
 * sessions become a sequential plan. The exercises are fetched first, so an
 * unreachable provider fails before anything is created; if a later step
 * fails, the presets made so far are removed again.
 */
export async function importWorkoutSplit(
  userId: string,
  splitId: string,
  request: ImportWorkoutSplitRequest
): Promise<ImportWorkoutSplitResponse> {
  const split = getWorkoutSplit(splitId);
  if (!split) throw new UnknownWorkoutSplitError(splitId);
  assertSessionNames(split, request.sessionNames);

  const { libraryIds, addedCount } = await ensureLibraryExercises(
    userId,
    workoutSplitExerciseIds(split)
  );

  const presetIds: Record<string, number> = {};
  try {
    for (const session of split.sessions) {
      const preset = (await workoutPresetService.createWorkoutPreset(userId, {
        name: `${request.planName}: ${request.sessionNames[session.id]}`,
        description: null,
        is_public: false,
        workout_format: 'standard',
        exercises: session.exercises.map((exercise, index) =>
          presetExercise(
            exercise,
            libraryIds.get(exercise.exerciseId) as string,
            index
          )
        ),
      })) as CreatedRow;
      presetIds[session.id] = preset.id;
    }
    const plan = (await workoutPlanTemplateService.createWorkoutPlanTemplate(
      userId,
      {
        plan_name: request.planName,
        description: null,
        is_active: request.activate,
        schedule_type: 'sequential',
        entry_mode: 'prompt',
        assignments: split.sessions.map((session, index) => ({
          session_index: index + 1,
          session_name: request.sessionNames[session.id],
          workout_preset_id: presetIds[session.id],
          sort_order: index,
        })),
      }
    )) as CreatedRow;
    return { planId: plan.id, presetIds, addedExerciseCount: addedCount };
  } catch (error) {
    await removeCreatedPresets(userId, Object.values(presetIds));
    throw error;
  }
}

async function removeCreatedPresets(
  userId: string,
  presetIds: number[]
): Promise<void> {
  for (const presetId of presetIds) {
    try {
      await workoutPresetService.deleteWorkoutPreset(userId, presetId);
    } catch (error) {
      log(
        'error',
        `Workout split import: could not remove preset ${presetId} after a failure: ${describeError(error)}`
      );
    }
  }
}
