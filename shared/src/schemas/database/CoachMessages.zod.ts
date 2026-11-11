import { z } from 'zod';

export const coachMessagesIdSchema = z.string();

export const coachMessagesSchema = z.object({
  id: coachMessagesIdSchema,
  user_id: z.string(),
  coach_id: z.string(),
  trigger_type: z.string(),
  entry_date: z.coerce.date(),
  facts: z.record(z.string(), z.unknown()),
  ai_text: z.string().nullable(),
  created_at: z.coerce.date(),
  read_at: z.coerce.date().nullable(),
  dismissed_at: z.coerce.date().nullable(),
});

export type CoachMessages = z.infer<typeof coachMessagesSchema>;
