import { z } from 'zod';
import {
  progressionIncrementTypeSchema,
  progressionModeSchema,
} from '@workspace/shared';
import { uuidSchema } from './common.js';

export const WORKOUT_PROGRESSION_ACTIONS = [
  'list_progression',
  'recommend_progression',
  'update_progression',
] as const;

const presetIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .describe('Numeric ID of the workout preset');

const presetExerciseIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .describe(
    'Numeric ID of one workout_preset_exercises row (from list_progression)'
  );

const PRESET_NAME_LOOKUP =
  'Name of a preset you own or that is family-shared (alternative to ID).';

const confirmedSchema = z
  .boolean()
  .optional()
  .describe(
    'Must be true to apply the mutation. If omitted or false, the tool returns a confirmation prompt and does not change anything.'
  );

const listProgressionSchema = z
  .object({
    action: z.literal('list_progression'),
    preset_id: presetIdSchema.optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
  })
  .strict();

const recommendProgressionSchema = z
  .object({
    action: z.literal('recommend_progression'),
    preset_id: presetIdSchema.optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
    exercise_id: uuidSchema.optional(),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Limit the recommendation to this exercise in the preset'),
    preset_exercise_id: presetExerciseIdSchema.optional(),
  })
  .strict();

const updateProgressionSchema = z
  .object({
    action: z.literal('update_progression'),
    preset_id: presetIdSchema.optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
    confirmed: confirmedSchema,
    apply_recommendations: z
      .boolean()
      .optional()
      .describe(
        'When true, write the same recommended settings recommend_progression would return. Ignores the explicit field values.'
      ),
    exercise_id: uuidSchema.optional(),
    exercise_name: z.string().min(1).max(200).optional(),
    preset_exercise_id: presetExerciseIdSchema.optional(),
    progression_mode: progressionModeSchema.optional(),
    rep_goal: z.coerce.number().int().positive().optional(),
    increment_type: progressionIncrementTypeSchema.optional(),
    increment_value: z.coerce.number().positive().optional(),
    equipment_brand: z.string().max(100).optional(),
  })
  .strict();

export const manageWorkoutProgressionSchema = z.discriminatedUnion('action', [
  listProgressionSchema,
  recommendProgressionSchema,
  updateProgressionSchema,
]);

export type ManageWorkoutProgressionInput = z.infer<
  typeof manageWorkoutProgressionSchema
>;

export const manageWorkoutProgressionInput = z.object({
  action: z.enum(WORKOUT_PROGRESSION_ACTIONS).optional(),
  preset_id: z.union([z.string(), z.number()]).optional(),
  preset_name: z.string().optional(),
  exercise_id: z.string().optional(),
  exercise_name: z.string().optional(),
  preset_exercise_id: z.union([z.string(), z.number()]).optional(),
  confirmed: z.boolean().optional(),
  apply_recommendations: z.boolean().optional(),
  progression_mode: progressionModeSchema.optional(),
  rep_goal: z.coerce.number().optional(),
  increment_type: progressionIncrementTypeSchema.optional(),
  increment_value: z.coerce.number().optional(),
  equipment_brand: z.string().optional(),
});
