import {
  getWorkoutSplit,
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  WORKOUT_SPLIT_EXERCISE_SOURCE,
  type ImportWorkoutSplitRequest,
  type ImportWorkoutSplitResponse,
  type WorkoutProgramFile,
  type WorkoutProgramPreset,
  type WorkoutSplit,
  type WorkoutSplitExercise,
  workoutSplitExerciseIds,
} from '@workspace/shared';
import { ValidationError } from '../utils/errors.js';
import {
  importWorkoutProgram,
  WorkoutProgramExercisesUnavailableError,
} from './workoutProgramService.js';

const WORKING_SET = 'Working Set';

export class UnknownWorkoutSplitError extends Error {
  constructor(splitId: string) {
    super(`Unknown workout split "${splitId}".`);
    this.name = 'UnknownWorkoutSplitError';
  }
}

/** Some of the split's exercises could not be added; nothing was created. */
export { WorkoutProgramExercisesUnavailableError as WorkoutSplitExercisesUnavailableError };

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

function presetExercise(
  exercise: WorkoutSplitExercise
): WorkoutProgramPreset['exercises'][number] {
  const timed = exercise.durationSeconds !== undefined;
  return {
    exercise: exercise.exerciseId,
    supersetGroup: exercise.supersetGroup ?? null,
    progressionMode: exercise.progressionMode,
    repGoal: timed ? null : (exercise.repGoal ?? null),
    incrementType: 'weight',
    // Kept null for a hold: the schema wants a positive value when it is set.
    incrementValue: exercise.incrementKg > 0 ? exercise.incrementKg : null,
    sets: Array.from({ length: exercise.sets }, (_, index) => ({
      setNumber: index + 1,
      setType: WORKING_SET,
      reps: timed ? null : exercise.reps,
      weight: null,
      duration: exercise.durationSeconds ?? null,
    })),
  };
}

/**
 * A split as a workout program file: its exercises by free-exercise-db id
 * (the catalog has no names, so the id stands in), one preset per session
 * and a sequential, prompt-mode plan running them from session 1.
 */
function splitAsProgram(
  split: WorkoutSplit,
  request: ImportWorkoutSplitRequest
): WorkoutProgramFile {
  return {
    format: WORKOUT_PROGRAM_FILE_FORMAT,
    version: WORKOUT_PROGRAM_FILE_VERSION,
    exercises: workoutSplitExerciseIds(split).map((exerciseId) => ({
      key: exerciseId,
      name: exerciseId.replace(/_/g, ' '),
      source: WORKOUT_SPLIT_EXERCISE_SOURCE,
      sourceId: exerciseId,
    })),
    presets: split.sessions.map((session) => ({
      key: session.id,
      name: `${request.planName}: ${request.sessionNames[session.id]}`,
      description: null,
      workoutFormat: 'standard',
      exercises: session.exercises.map(presetExercise),
    })),
    plan: {
      name: request.planName,
      description: null,
      scheduleType: 'sequential',
      entryMode: 'prompt',
      sessions: split.sessions.map((session, index) => ({
        // The repository stores a session index of 0 as null.
        sessionIndex: index + 1,
        sessionName: request.sessionNames[session.id],
        preset: session.id,
      })),
    },
  };
}

/**
 * Makes the person's own copy of a built-in split: its exercises are added to
 * the library from free-exercise-db, each session becomes a preset and the
 * sessions become a sequential plan. It goes through the workout program
 * import, with no custom fallback: an exercise the database cannot supply
 * fails the import before anything is created.
 */
export async function importWorkoutSplit(
  userId: string,
  splitId: string,
  request: ImportWorkoutSplitRequest
): Promise<ImportWorkoutSplitResponse> {
  const split = getWorkoutSplit(splitId);
  if (!split) throw new UnknownWorkoutSplitError(splitId);
  assertSessionNames(split, request.sessionNames);

  const result = await importWorkoutProgram(
    userId,
    splitAsProgram(split, request),
    { activate: request.activate, allowCustomExercises: false }
  );
  return {
    planId: result.planId as number,
    presetIds: result.presetIds,
    addedExerciseCount: result.addedExerciseCount,
  };
}
