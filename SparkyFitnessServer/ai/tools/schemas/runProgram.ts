import { z } from 'zod';
import {
  MAX_ADJUST_WORKOUTS,
  MAX_EASE_PERCENT,
  MAX_PUSH_PERCENT,
} from '@workspace/shared';

export const RUN_PROGRAM_ACTIONS = [
  'get_run_program',
  'start_run_program',
  'set_run_program_enabled',
  'repeat_run_program_week',
  'move_run_program',
  'adjust_run_program_running',
] as const;

const confirmedSchema = z
  .boolean()
  .optional()
  .describe(
    'Must be true to apply a change. If omitted or false, the tool says what it would do and changes nothing: ask the user first.'
  );

export const manageRunProgramSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get_run_program') }).strict(),
  z
    .object({
      action: z.literal('start_run_program'),
      program_id: z
        .string()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'beginner5k, fiveToTenK, faster5k, halfMarathon or marathon. Default beginner5k.'
        ),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('set_run_program_enabled'),
      enabled: z.boolean(),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('repeat_run_program_week'),
      week: z.coerce.number().int().min(1).max(52),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('move_run_program'),
      week: z.coerce.number().int().min(1).max(52),
      run: z.coerce.number().int().min(1).max(7).optional(),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('adjust_run_program_running'),
      percent: z.coerce
        .number()
        .min(-MAX_EASE_PERCENT)
        .max(MAX_PUSH_PERCENT)
        .describe(
          `Change in running time, ${-MAX_EASE_PERCENT} (much easier) to +${MAX_PUSH_PERCENT} (a little harder). Never more than +${MAX_PUSH_PERCENT}.`
        ),
      count: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_ADJUST_WORKOUTS)
        .optional()
        .describe('How many upcoming workouts to change. Default 1.'),
      confirmed: confirmedSchema,
    })
    .strict(),
]);

export type ManageRunProgramInput = z.infer<typeof manageRunProgramSchema>;

// Flat published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageRunProgramInput = z.object({
  action: z.enum(RUN_PROGRAM_ACTIONS).optional(),
  program_id: z.string().max(50).optional(),
  enabled: z.boolean().optional(),
  week: z.union([z.string(), z.number()]).optional(),
  run: z.union([z.string(), z.number()]).optional(),
  percent: z.union([z.string(), z.number()]).optional(),
  count: z.union([z.string(), z.number()]).optional(),
  confirmed: z.boolean().optional(),
});
