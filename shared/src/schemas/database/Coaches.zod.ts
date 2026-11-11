import { z } from 'zod';

export const coachesIdSchema = z.string();

export const coachesSchema = z.object({
  id: coachesIdSchema,
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  system_prompt: z.string(),
  tool_categories: z.array(z.string()),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const coachesInitializerSchema = z.object({
  id: coachesIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  system_prompt: z.string(),
  tool_categories: z.array(z.string()),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const coachesMutatorSchema = coachesInitializerSchema.partial();

export type Coaches = z.infer<typeof coachesSchema>;
export type CoachesInitializer = z.infer<typeof coachesInitializerSchema>;
export type CoachesMutator = z.infer<typeof coachesMutatorSchema>;
