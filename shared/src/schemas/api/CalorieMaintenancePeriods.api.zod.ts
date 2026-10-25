import { z } from 'zod';
import { runDayStringSchema } from './RunProgram.api.zod.ts';
import { calorieMaintenancePeriodKindSchema } from '../database/CalorieMaintenancePeriods.zod.ts';

/** The longest diet break, in days; the table check allows the same. */
export const MAX_DIET_BREAK_DAYS = 28;

export const calorieMaintenancePeriodSchema = z.object({
  id: z.string(),
  kind: calorieMaintenancePeriodKindSchema,
  /** First day (YYYY-MM-DD), included. */
  start_date: runDayStringSchema,
  /** Last day (YYYY-MM-DD), included; the same day for a refeed. */
  end_date: runDayStringSchema,
  note: z.string().nullable(),
});
export type CalorieMaintenancePeriod = z.infer<
  typeof calorieMaintenancePeriodSchema
>;

export const listCalorieMaintenancePeriodsQuerySchema = z.object({
  /** Only periods that touch this range; both ends are optional. */
  from: runDayStringSchema.optional(),
  to: runDayStringSchema.optional(),
});

export const listCalorieMaintenancePeriodsResponseSchema = z.object({
  periods: z.array(calorieMaintenancePeriodSchema),
});
export type ListCalorieMaintenancePeriodsResponse = z.infer<
  typeof listCalorieMaintenancePeriodsResponseSchema
>;

/**
 * A refeed takes `start_date` only (`end_date` is ignored if sent as the same
 * day, refused otherwise); a diet break needs both ends, at most
 * `MAX_DIET_BREAK_DAYS` days.
 */
export const createCalorieMaintenancePeriodBodySchema = z
  .object({
    kind: calorieMaintenancePeriodKindSchema,
    start_date: runDayStringSchema,
    end_date: runDayStringSchema.optional(),
    note: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const end = body.end_date ?? body.start_date;
    if (end < body.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'The last day cannot be before the first.',
      });
      return;
    }
    if (body.kind === 'refeed_day') {
      if (end !== body.start_date) {
        ctx.addIssue({
          code: 'custom',
          path: ['end_date'],
          message: 'A refeed day is a single day.',
        });
      }
      return;
    }
    if (body.end_date === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'A diet break needs a last day.',
      });
      return;
    }
    const days =
      (Date.parse(`${end}T00:00:00Z`) -
        Date.parse(`${body.start_date}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (days > MAX_DIET_BREAK_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: `A diet break is at most ${MAX_DIET_BREAK_DAYS} days.`,
      });
    }
  });
export type CreateCalorieMaintenancePeriodBody = z.infer<
  typeof createCalorieMaintenancePeriodBodySchema
>;
