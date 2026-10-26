import { z } from 'zod';
import { WORKOUT_SPLIT_VENUES } from '../../utils/workoutSplits.ts';
import {
  TRAINER_FOCUSES,
  TRAINER_SESSION_MINUTES,
} from '../../utils/workoutTrainer.ts';

/**
 * How the program finder fitted a program to the person. The server rebuilds
 * the adjusted program from these answers (`applyTrainerOptions`), so a client
 * never sends an exercise list.
 */
export const trainerOptionsSchema = z.object({
  /** Where the person trains; the program must fit it. */
  venue: z.enum(WORKOUT_SPLIT_VENUES),
  /** Minutes a session should take; the program is written for 60. */
  sessionMinutes: z
    .union([
      z.literal(TRAINER_SESSION_MINUTES[0]),
      z.literal(TRAINER_SESSION_MINUTES[1]),
      z.literal(TRAINER_SESSION_MINUTES[2]),
    ])
    .optional(),
  focus: z.enum(TRAINER_FOCUSES).optional(),
});

/**
 * Importing a built-in workout split (`WORKOUT_SPLITS`) makes the person's own
 * copy: one preset per session and a sequential plan that runs them in order.
 * The catalog holds ids only, so the client sends the names it shows (its
 * translations of the split and its sessions).
 */
export const importWorkoutSplitRequestSchema = z.object({
  /** Name of the plan; each preset is named "<planName>: <session name>". */
  planName: z.string().trim().min(1).max(120),
  /** The shown name of every session in the split, by session id. */
  sessionNames: z.record(z.string(), z.string().trim().min(1).max(100)),
  /** Make the plan the active one. Off keeps the person's current plan. */
  activate: z.boolean().default(false),
  /** Fit the program to the person, as the program finder shows it. */
  trainer: trainerOptionsSchema.optional(),
});

export type ImportWorkoutSplitRequest = z.infer<
  typeof importWorkoutSplitRequestSchema
>;

export const importWorkoutSplitResponseSchema = z.object({
  planId: z.number().int(),
  /** The preset made for each session, by session id. */
  presetIds: z.record(z.string(), z.number().int()),
  /** How many of the split's exercises were added to the library. */
  addedExerciseCount: z.number().int().min(0),
});

export type ImportWorkoutSplitResponse = z.infer<
  typeof importWorkoutSplitResponseSchema
>;

/** 502 body when free-exercise-db could not supply some of the exercises. */
export const importWorkoutSplitUnavailableResponseSchema = z.object({
  error: z.string(),
  /** free-exercise-db ids that could not be added; nothing was created. */
  missingExerciseIds: z.array(z.string()),
});

export type ImportWorkoutSplitUnavailableResponse = z.infer<
  typeof importWorkoutSplitUnavailableResponseSchema
>;
