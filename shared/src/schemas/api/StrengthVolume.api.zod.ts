import { z } from 'zod';

/**
 * GET /api/reports/strength-volume: weekly hard sets per muscle against a
 * target range, and a deload suggestion. Built by `buildMuscleVolume` and
 * `suggestDeload`; weeks start on the account's first day of the week. The
 * suggestion is read-only advice: nothing here changes a plan or program.
 */

export const volumeStatusSchema = z.enum([
  'under',
  'inRange',
  'over',
  /** Below the range in a week that is not over yet, so not a flag. */
  'building',
]);
export type VolumeStatus = z.infer<typeof volumeStatusSchema>;

export const muscleVolumeRowSchema = z.object({
  /** Canonical muscle name, as the exercise library spells it. */
  muscle: z.string(),
  /** Weighted hard sets this week so far (primary 1, secondary 0.5). */
  thisWeek: z.number(),
  lastWeek: z.number(),
  thisWeekStatus: volumeStatusSchema,
  lastWeekStatus: volumeStatusSchema,
});
export type MuscleVolumeRow = z.infer<typeof muscleVolumeRowSchema>;

export const deloadReasonCodeSchema = z.enum([
  'e1rm_dropping',
  'e1rm_stalled',
  'rpe_rising',
  'high_volume',
  'readiness_low',
  'hrv_low',
]);
export type DeloadReasonCode = z.infer<typeof deloadReasonCodeSchema>;

export const deloadReasonSchema = z.object({
  code: deloadReasonCodeSchema,
  /** Lift or muscle names the reason is about; empty for recovery signals. */
  items: z.array(z.string()),
  /**
   * The size of the effect as a whole number: percent below the peak
   * (`e1rm_dropping`), RPE points x10 (`rpe_rising`), percent below the
   * baseline (`readiness_low`, `hrv_low`); null when there is no single number.
   */
  value: z.number().nullable(),
});
export type DeloadReason = z.infer<typeof deloadReasonSchema>;

export const deloadStatusSchema = z.enum([
  'suggest',
  'ok',
  'notEnoughData',
  'recentlyDeloaded',
]);
export type DeloadStatus = z.infer<typeof deloadStatusSchema>;

export const deloadSuggestionSchema = z.object({
  status: deloadStatusSchema,
  /** Signals that fired, strongest first. Shown only when `status` is suggest. */
  reasons: z.array(deloadReasonSchema),
  /** Sum of the fired signals' weights. */
  score: z.number(),
  /** The lighter week, null unless `status` is suggest. */
  plan: z
    .object({
      /** First day of the proposed week (the week after this one). */
      weekStart: z.string(),
      /** Share of normal sets to do, as percents (e.g. 50 to 60). */
      setsPercent: z.object({ min: z.number(), max: z.number() }),
      /** Share of normal working loads to use, as percents. */
      loadPercent: z.object({ min: z.number(), max: z.number() }),
      /** Hard sets per muscle for that week, from the last full week. */
      muscleTargets: z.array(
        z.object({ muscle: z.string(), from: z.number(), to: z.number() })
      ),
    })
    .nullable(),
});
export type DeloadSuggestion = z.infer<typeof deloadSuggestionSchema>;

export const strengthVolumeSchema = z.object({
  /** The day the figures are relative to (`YYYY-MM-DD`, user's timezone). */
  today: z.string(),
  firstDayOfWeek: z.number().int().min(0).max(6),
  thisWeekStart: z.string(),
  lastWeekStart: z.string(),
  /** The weekly hard-set range per muscle, inclusive. */
  range: z.object({ min: z.number(), max: z.number() }),
  /** Muscles trained in the last few weeks, most volume first. */
  muscles: z.array(muscleVolumeRowSchema),
  deload: deloadSuggestionSchema,
});
export type StrengthVolume = z.infer<typeof strengthVolumeSchema>;
