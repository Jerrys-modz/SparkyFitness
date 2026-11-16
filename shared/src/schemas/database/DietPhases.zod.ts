import { z } from 'zod';

export const dietPhasesIdSchema = z.string();

/** loss / maintenance / gain; the weekly rate is a magnitude, its sign comes from the type. */
export const DIET_PHASE_TYPES = ['loss', 'maintenance', 'gain'] as const;
export const dietPhaseTypeSchema = z.enum(DIET_PHASE_TYPES);

export const dietPhasesSchema = z.object({
  id: dietPhasesIdSchema,
  user_id: z.string(),
  phase_type: dietPhaseTypeSchema,
  /** Kilograms per week, 0 to 2, gram precision; 0 for maintenance. */
  weekly_change_kg: z.number(),
  /** YYYY-MM-DD, first day of the phase. */
  start_date: z.string(),
  /** YYYY-MM-DD, last day of the phase (inclusive), or null. */
  end_date: z.string().nullable(),
  /** Length in whole weeks when no end date is given, or null. */
  duration_weeks: z.number().int().nullable(),
  /** Ends the phase once the weight trend reaches it (kg), or null. */
  target_weight_kg: z.number().nullable(),
  /** YYYY-MM-DD the server saw the trend reach the target; the phase's last day. */
  target_reached_on: z.string().nullable(),
  label: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type DietPhaseType = z.infer<typeof dietPhaseTypeSchema>;
export type DietPhasesRow = z.infer<typeof dietPhasesSchema>;
