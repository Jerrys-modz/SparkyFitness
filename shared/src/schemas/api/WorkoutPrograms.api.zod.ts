import { z } from 'zod';
import { EXERCISE_MODALITIES } from '../../constants/exercise.ts';

/**
 * A workout program file: a preset, or a plan with the presets it runs, as a
 * self-contained JSON document people can download, send to someone and add
 * to their own library. It never carries database ids or user ids. Exercises
 * are listed once with enough of their definition to be found or rebuilt on
 * another account (or another server), and presets and plan sessions point at
 * them by a key local to the file.
 *
 * Weights, increments and ramps are in kg and distances in km, the units the
 * server stores. Durations and rest times are seconds.
 */
export const WORKOUT_PROGRAM_FILE_FORMAT = 'sparkyfitness.workout-program';
export const WORKOUT_PROGRAM_FILE_VERSION = 1;

/** Caps keep a pasted or uploaded file from creating an unbounded library. */
export const WORKOUT_PROGRAM_LIMITS = {
  exercises: 200,
  presets: 50,
  exercisesPerPreset: 50,
  setsPerExercise: 50,
  sessions: 100,
} as const;

const key = z.string().trim().min(1).max(40);
const shortText = z.string().trim().max(200);
const stringList = z.array(z.string().trim().min(1).max(200)).max(50);

export const workoutProgramExerciseSchema = z.object({
  /** Key the presets and sessions in this file use to point at it. */
  key,
  name: z.string().trim().min(1).max(200),
  /**
   * Where the exercise came from. A `free-exercise-db` source is added from
   * that database on import; any other source is matched by name in the
   * receiver's library or created as their own custom exercise.
   */
  source: shortText.nullable().optional(),
  sourceId: shortText.nullable().optional(),
  category: shortText.nullable().optional(),
  modality: z.enum(EXERCISE_MODALITIES).nullable().optional(),
  level: shortText.nullable().optional(),
  force: shortText.nullable().optional(),
  mechanic: shortText.nullable().optional(),
  equipment: stringList.optional(),
  primaryMuscles: stringList.optional(),
  secondaryMuscles: stringList.optional(),
  instructions: z.array(z.string().trim().max(2000)).max(50).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  caloriesPerHour: z.number().min(0).max(5000).nullable().optional(),
});

export type WorkoutProgramExercise = z.infer<
  typeof workoutProgramExerciseSchema
>;

export const workoutProgramSetSchema = z.object({
  setNumber: z.number().int().positive().max(1000),
  setType: shortText.nullable().optional(),
  reps: z.number().min(0).max(10000).nullable().optional(),
  /** kg. */
  weight: z.number().min(0).max(10000).nullable().optional(),
  /** Seconds. */
  duration: z.number().int().min(0).max(86400).nullable().optional(),
  /** km. */
  distance: z.number().min(0).max(10000).nullable().optional(),
  /** Seconds. */
  restTime: z.number().int().min(0).max(86400).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type WorkoutProgramSet = z.infer<typeof workoutProgramSetSchema>;

export const workoutProgramPresetExerciseSchema = z.object({
  /** `key` of an entry in the file's `exercises`. */
  exercise: key,
  supersetGroup: z.number().int().min(0).max(1000).nullable().optional(),
  progressionMode: z
    .enum(['rep_goal', 'fixed', 'step_load', 'manual'])
    .nullable()
    .optional(),
  repGoal: z.number().int().positive().max(1000).nullable().optional(),
  incrementType: z.enum(['weight', 'reps']).nullable().optional(),
  /** kg for a weight increment, reps for a reps increment. */
  incrementValue: z.number().positive().max(1000).nullable().optional(),
  /** kg per working set within one session; negative ramps down. */
  rampIncrement: z.number().min(-9999.99).max(9999.99).nullable().optional(),
  sets: z
    .array(workoutProgramSetSchema)
    .max(WORKOUT_PROGRAM_LIMITS.setsPerExercise),
});

export const workoutProgramPresetSchema = z.object({
  key,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  workoutFormat: z
    .enum(['standard', 'interval', 'tabata', 'amrap', 'emom', 'for_time'])
    .default('standard'),
  timeCapSeconds: z.number().int().positive().max(86400).nullable().optional(),
  exercises: z
    .array(workoutProgramPresetExerciseSchema)
    .max(WORKOUT_PROGRAM_LIMITS.exercisesPerPreset),
});

export type WorkoutProgramPreset = z.infer<typeof workoutProgramPresetSchema>;

/**
 * One slot of a plan: a preset, or a single exercise with its own sets. A
 * weekly plan places it on `dayOfWeek` (0 = Sunday); a sequential plan runs
 * sessions by `sessionIndex`, from 1.
 */
export const workoutProgramSessionSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    sessionIndex: z.number().int().positive().max(1000).nullable().optional(),
    sessionName: z.string().trim().max(100).nullable().optional(),
    preset: key.optional(),
    exercise: key.optional(),
    sets: z
      .array(workoutProgramSetSchema)
      .max(WORKOUT_PROGRAM_LIMITS.setsPerExercise)
      .optional(),
  })
  .refine((session) => Boolean(session.preset) !== Boolean(session.exercise), {
    message: 'A session runs either a preset or an exercise.',
  });

export type WorkoutProgramSession = z.infer<typeof workoutProgramSessionSchema>;

export const workoutProgramPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  scheduleType: z.enum(['weekly', 'sequential']),
  entryMode: z.enum(['prompt', 'prefill']).default('prompt'),
  sessions: z
    .array(workoutProgramSessionSchema)
    .max(WORKOUT_PROGRAM_LIMITS.sessions),
});

export type WorkoutProgramPlan = z.infer<typeof workoutProgramPlanSchema>;

export const workoutProgramFileSchema = z
  .object({
    format: z.literal(WORKOUT_PROGRAM_FILE_FORMAT),
    version: z.literal(WORKOUT_PROGRAM_FILE_VERSION),
    exportedAt: z.string().max(40).optional(),
    exercises: z
      .array(workoutProgramExerciseSchema)
      .max(WORKOUT_PROGRAM_LIMITS.exercises),
    presets: z
      .array(workoutProgramPresetSchema)
      .max(WORKOUT_PROGRAM_LIMITS.presets),
    /** Absent when the file shares presets only. */
    plan: workoutProgramPlanSchema.nullable().optional(),
  })
  .superRefine((file, ctx) => {
    const exerciseKeys = new Set<string>();
    file.exercises.forEach((exercise, index) => {
      if (exerciseKeys.has(exercise.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate exercise key "${exercise.key}".`,
          path: ['exercises', index, 'key'],
        });
      }
      exerciseKeys.add(exercise.key);
    });
    const presetKeys = new Set<string>();
    file.presets.forEach((preset, presetIndex) => {
      if (presetKeys.has(preset.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate preset key "${preset.key}".`,
          path: ['presets', presetIndex, 'key'],
        });
      }
      presetKeys.add(preset.key);
      preset.exercises.forEach((exercise, exerciseIndex) => {
        if (!exerciseKeys.has(exercise.exercise)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown exercise "${exercise.exercise}".`,
            path: [
              'presets',
              presetIndex,
              'exercises',
              exerciseIndex,
              'exercise',
            ],
          });
        }
      });
    });
    file.plan?.sessions.forEach((session, index) => {
      if (session.preset && !presetKeys.has(session.preset)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown preset "${session.preset}".`,
          path: ['plan', 'sessions', index, 'preset'],
        });
      }
      if (session.exercise && !exerciseKeys.has(session.exercise)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown exercise "${session.exercise}".`,
          path: ['plan', 'sessions', index, 'exercise'],
        });
      }
    });
    if (file.presets.length === 0 && !file.plan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The file has no presets or plan.',
        path: ['presets'],
      });
    }
  });

export type WorkoutProgramFile = z.infer<typeof workoutProgramFileSchema>;

export const importWorkoutProgramRequestSchema = z.object({
  program: workoutProgramFileSchema,
  /** Replaces the plan's name; each preset keeps its own name. */
  planName: z.string().trim().min(1).max(120).optional(),
  /** Make the imported plan the active one. Off keeps the current plan. */
  activate: z.boolean().default(false),
});

export type ImportWorkoutProgramRequest = z.input<
  typeof importWorkoutProgramRequestSchema
>;

export const importWorkoutProgramResponseSchema = z.object({
  /** Null when the file held presets only. */
  planId: z.number().int().nullable(),
  /** The preset made for each preset key in the file. */
  presetIds: z.record(z.string(), z.number().int()),
  /** Exercises added to the library (from the exercise database or as custom). */
  addedExerciseCount: z.number().int().min(0),
});

export type ImportWorkoutProgramResponse = z.infer<
  typeof importWorkoutProgramResponseSchema
>;
