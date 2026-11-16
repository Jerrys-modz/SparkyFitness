import { z } from 'zod';
import { isDayString } from '../../utils/timezone.ts';

/** Largest goal weight the `numeric(5,2)` column holds. */
export const MAX_GOAL_WEIGHT_KG = 999.99;

const goalDaySchema = z
  .string()
  .refine(isDayString, { message: 'Expected a YYYY-MM-DD calendar day.' });

/**
 * `PUT /api/onboarding/target-weight`. `targetDate` is optional so older clients
 * that only send the weight keep the saved date; null clears it. Clearing the
 * weight clears the date too.
 */
export const setGoalWeightBodySchema = z.object({
  targetWeight: z
    .number()
    .max(MAX_GOAL_WEIGHT_KG)
    .nullable()
    // Round to the column's two decimals before the positivity check, so a
    // value that would store as 0 (e.g. 0.004) is refused.
    .transform((kg) => (kg === null ? null : Math.round(kg * 100) / 100))
    .refine((kg) => kg === null || kg > 0),
  targetDate: goalDaySchema.nullable().optional(),
});
export type SetGoalWeightBody = z.infer<typeof setGoalWeightBodySchema>;

export const setGoalWeightResponseSchema = z.object({
  targetWeight: z.number().nullable(),
  targetDate: z.string().nullable(),
});
export type SetGoalWeightResponse = z.infer<typeof setGoalWeightResponseSchema>;

export const goalWeightPlanStatusSchema = z.enum([
  'reached',
  'date_passed',
  'on_course',
  'needs_faster',
  'needs_slower',
  'wrong_direction',
  'no_setting',
]);

/** `GET /api/onboarding/target-weight/plan`. */
export const goalWeightPlanResponseSchema = z.object({
  goalKg: z.number().nullable(),
  targetDate: z.string().nullable(),
  setOn: z.string().nullable(),
  /** Current trend weight, kg; null with too few weigh-ins. */
  currentKg: z.number().nullable(),
  /** The saved calorie goal mode (`cut`, `weekly`, ...), for wording. */
  goalMode: z.string().nullable(),
  /** The saved weekly change for `goal_mode = 'weekly'`, kg (signed). */
  weeklyChangeKg: z.number().nullable(),
  /** Null without a goal weight, a target date or a current weight. */
  plan: z
    .object({
      status: goalWeightPlanStatusSchema,
      daysLeft: z.number().int(),
      remainingKg: z.number(),
      requiredKgPerWeek: z.number().nullable(),
      requiredPercentPerWeek: z.number().nullable(),
      safetyZone: z.enum(['green', 'yellow', 'red']).nullable(),
      requiredDailyKcal: z.number().nullable(),
      suggestedCalories: z.number().nullable(),
      belowFloor: z.boolean(),
      earliestDate: z.string().nullable(),
      settingKgPerWeek: z.number().nullable(),
      settingReachDate: z.string().nullable(),
      highCutKgPerWeek: z.number().nullable(),
      schedule: z
        .object({ plannedKg: z.number(), daysAhead: z.number().int() })
        .nullable(),
    })
    .nullable(),
});
export type GoalWeightPlanResponse = z.infer<
  typeof goalWeightPlanResponseSchema
>;
