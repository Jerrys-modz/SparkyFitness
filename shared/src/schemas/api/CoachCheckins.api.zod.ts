import { z } from 'zod';
import {
  BUILTIN_COACH_ID_PREFIX,
  type BuiltinCoachKey,
} from '../../constants/coaches.ts';
import {
  CHECKIN_COACH_KEYS,
  COACH_TRIGGER_TYPES,
} from '../../utils/coachTriggers.ts';

/**
 * Coach check-ins (#2013): the built-in coaches a person lets speak up on
 * their own, and the messages those check-ins produce. Off until switched on.
 */
export const CHECKIN_COACH_IDS: readonly string[] = CHECKIN_COACH_KEYS.map(
  (key: BuiltinCoachKey) => `${BUILTIN_COACH_ID_PREFIX}${key}`
);

export const COACH_CHECKIN_DEFAULT_HOUR = 9;

const coachIdsSchema = z
  .array(z.string())
  .max(CHECKIN_COACH_IDS.length)
  .refine((ids) => ids.every((id) => CHECKIN_COACH_IDS.includes(id)), {
    message: 'Unknown coach.',
  })
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Each coach can be listed once.',
  });

export const coachCheckinSettingsSchema = z.object({
  enabled: z.boolean(),
  /** The built-in coaches allowed to check in, as `builtin:<key>` ids. */
  coach_ids: coachIdsSchema,
  /** The hour of the person's day (0-23) from which check-ins are written. */
  checkin_hour: z.number().int().min(0).max(23),
  /**
   * Let the person's AI service word each message. Off means the apps show a
   * ready-made sentence and no AI request is made.
   */
  ai_wording: z.boolean(),
});

export const updateCoachCheckinSettingsBodySchema = coachCheckinSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
  });

export const coachMessageSchema = z.object({
  id: z.string(),
  coach_id: z.string(),
  trigger_type: z.enum(COACH_TRIGGER_TYPES),
  /** The person's calendar day the message was written on. */
  entry_date: z.string(),
  /** The numbers behind the message, for the app's own sentence. */
  facts: z.record(z.string(), z.number()),
  /** The AI-worded message, or null to show the app's own sentence. */
  text: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

export const coachMessageListSchema = z.array(coachMessageSchema);

export const coachCheckNowResponseSchema = z.object({
  /** How many new messages this check wrote. */
  created: z.number().int().min(0),
});

export type CoachCheckinSettings = z.infer<typeof coachCheckinSettingsSchema>;
export type UpdateCoachCheckinSettingsBody = z.infer<
  typeof updateCoachCheckinSettingsBodySchema
>;
export type CoachMessage = z.infer<typeof coachMessageSchema>;
