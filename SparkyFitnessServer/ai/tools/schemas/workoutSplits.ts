import { z } from 'zod';
import {
  WORKOUT_SPLIT_GOALS,
  WORKOUT_SPLIT_VENUES,
  WORKOUT_SPLITS,
} from '@workspace/shared';

export const WORKOUT_SPLIT_ACTIONS = [
  'list_workout_splits',
  'get_workout_split',
  'import_workout_split',
] as const;

const SPLIT_IDS = WORKOUT_SPLITS.map((split) => split.id).join(', ');

const splitIdSchema = z
  .string()
  .min(1)
  .max(50)
  .describe(`A program id from list_workout_splits: ${SPLIT_IDS}.`);

export const manageWorkoutSplitsSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list_workout_splits'),
      venue: z
        .enum(WORKOUT_SPLIT_VENUES)
        .optional()
        .describe(
          'Where the user trains: home (dumbbells, bench, pull-up bar), garage (adds a barbell and squat rack) or gym (adds machines and cables). Also lists the smaller venues.'
        ),
      level: z.enum(['beginner', 'intermediate']).optional(),
      goal: z.enum(WORKOUT_SPLIT_GOALS).optional(),
      days_per_week: z.coerce.number().int().min(1).max(7).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('get_workout_split'),
      split_id: splitIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('import_workout_split'),
      split_id: splitIdSchema,
      plan_name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional()
        .describe('Name for the new plan. Defaults to the program name.'),
      activate: z
        .boolean()
        .optional()
        .describe(
          'Make the new plan the active one. Default false: ask the user.'
        ),
      confirmed: z
        .boolean()
        .optional()
        .describe(
          'Must be true to add the program. If omitted or false, the tool says what it would do and changes nothing: ask the user first.'
        ),
    })
    .strict(),
]);

export type ManageWorkoutSplitsInput = z.infer<
  typeof manageWorkoutSplitsSchema
>;

// Flat published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageWorkoutSplitsInput = z.object({
  action: z.enum(WORKOUT_SPLIT_ACTIONS).optional(),
  venue: z.string().optional(),
  level: z.string().optional(),
  goal: z.string().optional(),
  days_per_week: z.union([z.string(), z.number()]).optional(),
  split_id: z.string().max(50).optional(),
  plan_name: z.string().max(120).optional(),
  activate: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});
