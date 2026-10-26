import { tool } from 'ai';
import {
  getWorkoutSplit,
  splitFitsVenue,
  WORKOUT_SPLITS,
  workoutSplitExerciseIds,
  type WorkoutSplit,
  type WorkoutSplitExercise,
  type WorkoutSplitVenue,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import {
  importWorkoutSplit,
  UnknownWorkoutSplitError,
  WorkoutSplitExercisesUnavailableError,
} from '../../services/workoutSplitService.js';
import { ValidationError } from '../../utils/errors.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  manageWorkoutSplitsSchema,
  manageWorkoutSplitsInput,
  WORKOUT_SPLIT_ACTIONS,
  type ManageWorkoutSplitsInput,
} from './schemas/workoutSplits.js';

const VALID_ACTIONS = [...WORKOUT_SPLIT_ACTIONS];

const VENUE_NEEDS: Record<WorkoutSplitVenue, string> = {
  home: 'at home (dumbbells, a bench and a pull-up bar)',
  garage: 'garage gym (adds a barbell and squat rack)',
  gym: 'gym (adds machines and cables)',
};

/** "full_body_3_home" as "Full body 3 home": the catalog holds ids only. */
const humanize = (id: string): string => {
  const words = id.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A free-exercise-db id as a readable name ("Barbell_Squat" is "Barbell Squat"). */
const exerciseName = (exerciseId: string): string =>
  exerciseId.replace(/_/g, ' ');

function describeExercise(exercise: WorkoutSplitExercise): string {
  const name = exerciseName(exercise.exerciseId);
  if (exercise.durationSeconds !== undefined) {
    return `${name}: ${exercise.sets} x ${exercise.durationSeconds} s hold`;
  }
  const reps =
    exercise.repGoal !== undefined
      ? `${exercise.reps}-${exercise.repGoal}`
      : String(exercise.reps);
  const progression =
    exercise.progressionMode === 'fixed'
      ? `adds ${exercise.incrementKg} kg each session`
      : `adds ${exercise.incrementKg} kg once every set reaches ${exercise.repGoal ?? exercise.reps} reps`;
  return `${name}: ${exercise.sets} x ${reps} (${progression})`;
}

function summariseSplit(split: WorkoutSplit): string {
  const sessions = split.sessions
    .map((session) => humanize(session.id))
    .join(', ');
  return `- ${split.id} (${humanize(split.id)}): ${split.level}, ${split.goal === 'muscle' ? 'build muscle' : 'gain strength'}, ${VENUE_NEEDS[split.venue]}, ${split.daysPerWeek} days a week, sessions in rotation: ${sessions}`;
}

function detailSplit(split: WorkoutSplit): string {
  const lines = [
    `# ${humanize(split.id)} (${split.id})`,
    `Level: ${split.level}. Goal: ${split.goal === 'muscle' ? 'build muscle' : 'gain strength'}. Needs: ${VENUE_NEEDS[split.venue]}. ${split.daysPerWeek} days a week, doing the sessions in order and starting over.`,
  ];
  for (const session of split.sessions) {
    lines.push('', `## ${humanize(session.id)}`);
    for (const exercise of session.exercises) {
      lines.push(`- ${describeExercise(exercise)}`);
    }
  }
  lines.push(
    '',
    'Weights are entered by the user as they log their first workout. Weights are in kg.'
  );
  return lines.join('\n');
}

const confirmFirst = (what: string): string =>
  `${what} Confirm with the user first. If they agree, call this action again with the same fields and confirmed=true. Nothing was changed.`;

export function buildWorkoutSplitTools(userId: string, tz: string) {
  return {
    sparky_manage_workout_splits: tool({
      description: `Ready-made strength programs (splits) for people starting strength training: full body, linear 5x5, upper/lower, push/pull/legs and body part splits, for the gym, a garage gym or at home. Adding one puts its exercises in the user's library, a preset for each session and a sequential workout plan.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_workout_splits' (fields: venue? "home"|"garage"|"gym" (where the user trains; also lists the smaller venues), level? "beginner"|"intermediate", goal? "muscle"|"strength", days_per_week?) — lists the programs
- action: 'get_workout_split' (fields: split_id) — the sessions and exercises of one program
- action: 'import_workout_split' (fields: split_id, plan_name?, activate? (default false), confirmed) — adds the program for the user

Adding needs confirmed=true after the user has agreed. Ask where they train and how many days a week first, recommend a fitting program, and remind them to check with a doctor or healthcare professional before starting a new workout program, especially with a medical condition or an injury.`,
      inputSchema: manageWorkoutSplitsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_workout_splits'
        );
        const parsed = manageWorkoutSplitsSchema.safeParse(normalized);
        if (!parsed.success) return formatZodError(parsed.error);
        const args: ManageWorkoutSplitsInput = parsed.data;
        const splitId = 'split_id' in args ? args.split_id : '';
        try {
          if (args.action === 'list_workout_splits') {
            const matches = WORKOUT_SPLITS.filter(
              (split) =>
                (args.venue === undefined ||
                  splitFitsVenue(split, args.venue)) &&
                (args.level === undefined || split.level === args.level) &&
                (args.goal === undefined || split.goal === args.goal) &&
                (args.days_per_week === undefined ||
                  split.daysPerWeek === args.days_per_week)
            );
            if (matches.length === 0) {
              return 'No program matches those filters. Try fewer filters.';
            }
            return [
              `# Workout programs (${matches.length})`,
              ...matches.map(summariseSplit),
            ].join('\n');
          }

          const split = getWorkoutSplit(args.split_id);
          if (!split) {
            return ERRORS.NOT_FOUND('workout program', args.split_id);
          }

          if (args.action === 'get_workout_split') {
            return detailSplit(split);
          }

          const planName = args.plan_name ?? humanize(split.id);
          const activate = args.activate ?? false;
          if (args.confirmed !== true) {
            return confirmFirst(
              `This will add ${workoutSplitExerciseIds(split).length} exercises to the user's library (the ones they do not have yet), create ${split.sessions.length} workout presets and a sequential workout plan named "${planName}"${activate ? ', and make it their active plan' : ', without making it their active plan'}. Remind the user to check with a doctor or healthcare professional before starting a new workout program, especially with a medical condition or an injury.`
            );
          }
          const result = await importWorkoutSplit(userId, split.id, {
            planName,
            sessionNames: Object.fromEntries(
              split.sessions.map((session) => [
                session.id,
                humanize(session.id),
              ])
            ),
            activate,
          });
          return formatConfirmation(
            `Added "${planName}": ${split.sessions.length} presets and a sequential workout plan (id ${result.planId})${activate ? ', now the active plan' : ''}. ${result.addedExerciseCount} exercises were added to the library. The user sets their starting weights as they log their first workout.`
          );
        } catch (error) {
          if (error instanceof UnknownWorkoutSplitError) {
            return ERRORS.NOT_FOUND('workout program', splitId);
          }
          if (error instanceof ValidationError) {
            return ERRORS.VALIDATION(error.message);
          }
          if (error instanceof WorkoutSplitExercisesUnavailableError) {
            return ERRORS.VALIDATION(
              `${error.message} Nothing was added. Missing: ${error.missingExerciseIds.join(', ')}.`
            );
          }
          log('error', '[Workout Split Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
