import { z } from 'zod';

export const coachCheckinSettingsRowSchema = z.object({
  user_id: z.string(),
  enabled: z.boolean(),
  coach_ids: z.array(z.string()),
  checkin_hour: z.number().int(),
  ai_wording: z.boolean(),
  last_evaluated_day: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type CoachCheckinSettingsRow = z.infer<
  typeof coachCheckinSettingsRowSchema
>;
