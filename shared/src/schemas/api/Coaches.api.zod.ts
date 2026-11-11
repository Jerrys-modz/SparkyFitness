import { z } from 'zod';
import { CHAT_TOOL_CATEGORY_SLUGS } from '../../constants/chatToolCategories.ts';
import {
  COACH_DESCRIPTION_MAX_LENGTH,
  COACH_NAME_MAX_LENGTH,
  COACH_PROMPT_MAX_LENGTH,
} from '../../constants/coaches.ts';

/**
 * A person's own coaches (#2013). The built-in coaches are constants
 * (`BUILTIN_COACHES`) and never appear in these responses.
 */
const toolCategoriesSchema = z
  .array(z.enum(CHAT_TOOL_CATEGORY_SLUGS))
  .min(1)
  .max(CHAT_TOOL_CATEGORY_SLUGS.length)
  .refine((value) => new Set(value).size === value.length, {
    message: 'Each tool category can be listed once.',
  });

export const createCoachBodySchema = z
  .object({
    name: z.string().trim().min(1).max(COACH_NAME_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .max(COACH_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
    /** What the coach focuses on and how it should talk. */
    system_prompt: z.string().trim().min(1).max(COACH_PROMPT_MAX_LENGTH),
    /** The only tool categories a chat with this coach may use. */
    tool_categories: toolCategoriesSchema,
  })
  .strict();

export const updateCoachBodySchema = createCoachBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
  });

export const coachResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  system_prompt: z.string(),
  tool_categories: z.array(z.enum(CHAT_TOOL_CATEGORY_SLUGS)),
  created_at: z.string(),
  updated_at: z.string(),
});

export const coachListResponseSchema = z.array(coachResponseSchema);

export type CreateCoachBody = z.infer<typeof createCoachBodySchema>;
export type UpdateCoachBody = z.infer<typeof updateCoachBodySchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;
