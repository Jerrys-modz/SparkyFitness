import { z } from 'zod';

/**
 * Sparky's short daily summary (#2013): a few sentences about the day so far
 * and at most two suggestions, written by the person's own AI service from
 * what they logged and what they asked Sparky to remember.
 *
 * `status` says why there is no text: `no_ai_service` when no chat AI service
 * is set up, `no_data` when nothing was logged today or yesterday (no AI
 * request is made for either).
 */
export const ASSISTANT_DAILY_SUMMARY_MAX_SUGGESTIONS = 2;

export const assistantDailySummaryRequestSchema = z
  .object({
    /** Write a new summary even when a recent one is held for today. */
    refresh: z.boolean().optional(),
  })
  .strict();

export const assistantDailySummaryStatusSchema = z.enum([
  'ready',
  'no_ai_service',
  'no_data',
]);

export const assistantDailySummaryResponseSchema = z.object({
  status: assistantDailySummaryStatusSchema,
  /** The person's calendar day (YYYY-MM-DD) the summary is about. */
  date: z.string(),
  summary: z.string().nullable(),
  suggestions: z.array(z.string()).max(ASSISTANT_DAILY_SUMMARY_MAX_SUGGESTIONS),
  generated_at: z.string().nullable(),
});

/** What the AI service is asked to return. */
export const assistantDailySummaryProviderSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  suggestions: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
});

/** The part of a preferences update that belongs to Sparky's memory. */
export const assistantMemoryPreferencesSchema = z.object({
  assistant_memory_enabled: z.boolean().optional(),
});

export type AssistantDailySummaryRequest = z.infer<
  typeof assistantDailySummaryRequestSchema
>;
export type AssistantDailySummaryResponse = z.infer<
  typeof assistantDailySummaryResponseSchema
>;
