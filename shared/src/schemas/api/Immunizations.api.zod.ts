import { z } from 'zod';
import { calendarDaySchema } from './calendarDay.zod.ts';

export const immunizationSourceSchema = z.enum(['manual', 'import']);
export type ImmunizationSource = z.infer<typeof immunizationSourceSchema>;

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const immunizationFields = {
  vaccine_name: z.string().trim().min(1).max(200),
  /** Optional standard code (for example a CDC CVX code). */
  vaccine_code: optionalText(40),
  administered_on: calendarDaySchema,
  dose_number: z.number().int().min(1).max(20).nullable().optional(),
  lot_number: optionalText(80),
  administered_by: optionalText(200),
  site: optionalText(80),
  next_due_on: calendarDaySchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

const dueAfterGiven = (body: {
  administered_on?: string;
  next_due_on?: string | null;
}): boolean =>
  body.administered_on == null ||
  body.next_due_on == null ||
  body.next_due_on >= body.administered_on;

const dueAfterGivenIssue = {
  message: 'next_due_on must not be before administered_on',
  path: ['next_due_on'],
};

export const createImmunizationBodySchema = z
  .object(immunizationFields)
  .refine(dueAfterGiven, dueAfterGivenIssue);
export type CreateImmunizationBody = z.infer<
  typeof createImmunizationBodySchema
>;

export const updateImmunizationBodySchema = z
  .object({
    ...immunizationFields,
    vaccine_name: immunizationFields.vaccine_name.optional(),
    administered_on: calendarDaySchema.optional(),
  })
  .refine(dueAfterGiven, dueAfterGivenIssue);
export type UpdateImmunizationBody = z.infer<
  typeof updateImmunizationBodySchema
>;

export const immunizationResponseSchema = z.object({
  id: z.string(),
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
  source: immunizationSourceSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type ImmunizationResponse = z.infer<typeof immunizationResponseSchema>;

export const immunizationListQuerySchema = z.object({
  startDate: calendarDaySchema.optional(),
  endDate: calendarDaySchema.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});
export type ImmunizationListQuery = z.infer<typeof immunizationListQuerySchema>;
