import { z } from 'zod';
import { isDayString } from '../../utils/timezone.ts';
import { dietPhaseTypeSchema } from '../database/DietPhases.zod.ts';
import { MAX_GOAL_MODE_WEEKLY_CHANGE_KG } from '../../utils/calorieCalculations.ts';
import {
  MAX_DIET_PHASES,
  MAX_DIET_PHASE_WEEKS,
} from '../../utils/dietPhases.ts';

const dietPhaseDaySchema = z
  .string()
  .refine(isDayString, { message: 'Expected YYYY-MM-DD' });

/** One phase as a client sends it; `id` keeps an existing phase. */
export const dietPhaseInputSchema = z
  .object({
    id: z.uuid().optional(),
    phase_type: dietPhaseTypeSchema,
    weekly_change_kg: z
      .number()
      .min(0)
      .max(MAX_GOAL_MODE_WEEKLY_CHANGE_KG)
      .multipleOf(0.001),
    start_date: dietPhaseDaySchema,
    end_date: dietPhaseDaySchema.nullable().default(null),
    duration_weeks: z
      .number()
      .int()
      .min(1)
      .max(MAX_DIET_PHASE_WEEKS)
      .nullable()
      .default(null),
    target_weight_kg: z.number().positive().max(1000).nullable().default(null),
    label: z.string().trim().max(60).nullable().default(null),
  })
  .superRefine((phase, ctx) => {
    if (phase.end_date !== null && phase.duration_weeks !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['duration_weeks'],
        message: 'Give an end date or a duration, not both',
      });
    }
    if (
      phase.end_date === null &&
      phase.duration_weeks === null &&
      phase.target_weight_kg === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'A phase needs an end date, a duration or a target weight',
      });
    }
    if (phase.end_date !== null && phase.end_date < phase.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'The end date is before the start date',
      });
    }
    if (phase.phase_type === 'maintenance') {
      if (phase.weekly_change_kg !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekly_change_kg'],
          message: 'A maintenance phase has no weekly change',
        });
      }
      if (phase.target_weight_kg !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['target_weight_kg'],
          message: 'A maintenance phase has no target weight',
        });
      }
    } else if (phase.weekly_change_kg <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekly_change_kg'],
        message: 'A loss or gain phase needs a weekly change',
      });
    }
  });
export type DietPhaseInput = z.infer<typeof dietPhaseInputSchema>;

/** `PUT /api/v2/diet-phases`: the whole plan; phases not listed are removed. */
export const saveDietPhasesBodySchema = z.object({
  phases: z.array(dietPhaseInputSchema).max(MAX_DIET_PHASES),
});
export type SaveDietPhasesBody = z.infer<typeof saveDietPhasesBodySchema>;

export const dietPhaseSchema = z.object({
  id: z.string(),
  phase_type: dietPhaseTypeSchema,
  weekly_change_kg: z.number(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  duration_weeks: z.number().nullable(),
  target_weight_kg: z.number().nullable(),
  target_reached_on: z.string().nullable(),
  label: z.string().nullable(),
  /** The actual last day (planned end or target reached), null while open-ended. */
  effective_end_date: z.string().nullable(),
});
export type DietPhase = z.infer<typeof dietPhaseSchema>;

export const dietPhaseStatusSchema = z.object({
  current: dietPhaseSchema.nullable(),
  days_left: z.number().nullable(),
  next: dietPhaseSchema.nullable(),
  change_on: z.string().nullable(),
  days_until_change: z.number().nullable(),
  change_soon: z.boolean(),
});
export type DietPhaseStatus = z.infer<typeof dietPhaseStatusSchema>;

/** `GET`/`PUT /api/v2/diet-phases` response. */
export const dietPhasesResponseSchema = z.object({
  /** Today in the profile's timezone. */
  today: z.string(),
  /** In start order. */
  phases: z.array(dietPhaseSchema),
  status: dietPhaseStatusSchema,
});
export type DietPhasesResponse = z.infer<typeof dietPhasesResponseSchema>;

/** Why the server refused a plan (400 `code`). */
export const DIET_PHASE_ERROR_CODES = [
  'invalid',
  'overlap',
  'past_locked',
] as const;
export type DietPhaseErrorCode = (typeof DIET_PHASE_ERROR_CODES)[number];
