import { z } from 'zod';
import {
  COACHING_GOAL_DIRECTIONS,
  COACHING_MAX_RATE_KG_PER_WEEK,
} from '../../utils/weightCoaching.ts';

const dayString = z.iso.date();

export const coachingGoalDirectionSchema = z.enum(COACHING_GOAL_DIRECTIONS);

export const coachingReasonSchema = z.enum([
  'insufficient-data',
  'low-adherence',
  'implausible-estimate',
  'on-track',
  'behind',
  'ahead',
  'drifting',
  'off-target-intake',
]);

export const coachingSettingsSchema = z.object({
  direction: coachingGoalDirectionSchema,
  rateKgPerWeek: z.number().min(0).max(COACHING_MAX_RATE_KG_PER_WEEK),
  /** 0 = Sunday ... 6 = Saturday. */
  checkInWeekday: z.number().int().min(0).max(6),
});
export type CoachingSettings = z.infer<typeof coachingSettingsSchema>;

export const updateCoachingSettingsBodySchema = coachingSettingsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one setting is required.',
  });
export type UpdateCoachingSettingsBody = z.infer<
  typeof updateCoachingSettingsBodySchema
>;

const targetsSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const coachingCheckInResponseSchema = z.object({
  asOf: dayString,
  reason: coachingReasonSchema,
  dataQuality: z.object({
    windowDays: z.number(),
    loggedDays: z.number(),
    excludedDays: z.number(),
    weighIns: z.number(),
    outlierWeighIns: z.number(),
    weighInSpanDays: z.number(),
    adherence: z.number(),
    missingLoggedDays: z.number(),
    missingWeighIns: z.number(),
    missingSpanDays: z.number(),
    ready: z.boolean(),
  }),
  trend: z.object({
    series: z.array(
      z.object({
        date: dayString,
        weightKg: z.number(),
        trendKg: z.number(),
        outlier: z.boolean(),
      })
    ),
    currentKg: z.number().nullable(),
    weeklyRateKg: z.number().nullable(),
  }),
  expenditure: z.object({
    kcal: z.number().nullable(),
    rawKcal: z.number().nullable(),
    avgIntakeKcal: z.number().nullable(),
    marginKcal: z.number().nullable(),
    history: z.array(
      z.object({
        date: dayString,
        kcal: z.number(),
        smoothedKcal: z.number(),
      })
    ),
  }),
  goal: z.object({
    direction: coachingGoalDirectionSchema,
    rateKgPerWeek: z.number(),
    targetWeeklyChangeKg: z.number(),
  }),
  current: targetsSchema,
  suggested: targetsSchema.nullable(),
  changeKcal: z.number(),
  limits: z.array(z.enum(['weekly-cap', 'safety-floor', 'uncertain-estimate'])),
  proteinFloorApplied: z.boolean(),
  actionable: z.boolean(),
  settings: coachingSettingsSchema,
  /** Calorie Settings (adaptive goal or a goal mode) set the calorie target, so accepting here would be overridden. */
  goalManagedBySettings: z.boolean(),
  /** Today is the person's chosen check-in weekday. */
  checkInDue: z.boolean(),
});
export type CoachingCheckInResponse = z.infer<
  typeof coachingCheckInResponseSchema
>;

export const acceptCoachingCheckInBodySchema = z.object({
  /** The calorie target the person was shown; refused if the check-in has since changed. */
  calories: z.number().int().min(0).max(20_000),
});
export type AcceptCoachingCheckInBody = z.infer<
  typeof acceptCoachingCheckInBodySchema
>;
