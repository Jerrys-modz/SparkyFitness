import { z } from 'zod';

export const immunizationsIdSchema = z.string();

export const immunizationsSchema = z.object({
  id: immunizationsIdSchema,
  user_id: z.string(),
  vaccine_name: z.string(),
  vaccine_code: z.string().nullable(),
  administered_on: z.string(),
  dose_number: z.number().nullable(),
  lot_number: z.string().nullable(),
  administered_by: z.string().nullable(),
  site: z.string().nullable(),
  next_due_on: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const immunizationsInitializerSchema = z.object({
  id: immunizationsIdSchema.optional(),
  user_id: z.string(),
  vaccine_name: z.string(),
  vaccine_code: z.string().optional().nullable(),
  administered_on: z.string(),
  dose_number: z.number().optional().nullable(),
  lot_number: z.string().optional().nullable(),
  administered_by: z.string().optional().nullable(),
  site: z.string().optional().nullable(),
  next_due_on: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const immunizationsMutatorSchema =
  immunizationsInitializerSchema.partial();

export type Immunizations = z.infer<typeof immunizationsSchema>;
export type ImmunizationsInitializer = z.infer<
  typeof immunizationsInitializerSchema
>;
export type ImmunizationsMutator = z.infer<typeof immunizationsMutatorSchema>;
