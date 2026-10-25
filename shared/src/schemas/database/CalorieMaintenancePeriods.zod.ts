import { z } from 'zod';

export const calorieMaintenancePeriodKindSchema = z.enum([
  'refeed_day',
  'diet_break',
]);

export const calorieMaintenancePeriodsRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: calorieMaintenancePeriodKindSchema,
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  note: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const calorieMaintenancePeriodsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  kind: calorieMaintenancePeriodKindSchema,
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  note: z.string().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type CalorieMaintenancePeriodsRow = z.infer<
  typeof calorieMaintenancePeriodsRowSchema
>;
export type CalorieMaintenancePeriodsInitializer = z.infer<
  typeof calorieMaintenancePeriodsInitializerSchema
>;
