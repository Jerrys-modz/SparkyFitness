import { z } from 'zod';
import { MACRO_WEIGHT_BASES } from '../../utils/macroPerKg.ts';

/** How a day's per-kg protein/fat goal was turned into grams. */
export const macroPerKgResolutionSchema = z.object({
  protein_per_kg: z.number().nullable(),
  carbs_per_kg: z.number().nullable().optional(),
  fat_per_kg: z.number().nullable(),
  requested_basis: z.enum(MACRO_WEIGHT_BASES),
  basis_used: z.enum(MACRO_WEIGHT_BASES).nullable(),
  basis_kg: z.number().nullable(),
  weight_kg: z.number().nullable(),
  reference: z.enum(['fixed', 'logged']).optional(),
  missing_weight: z.boolean(),
  lean_mass_fallback: z.boolean(),
  locked_kcal: z.number().optional(),
  available_kcal: z.number().optional(),
});

export const dailyGoalsResponseSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  water_goal_ml: z.number(),
  saturated_fat: z.number(),
  polyunsaturated_fat: z.number(),
  monounsaturated_fat: z.number(),
  trans_fat: z.number(),
  cholesterol: z.number(),
  sodium: z.number(),
  potassium: z.number(),
  dietary_fiber: z.number(),
  sugars: z.number(),
  vitamin_a: z.number(),
  vitamin_c: z.number(),
  calcium: z.number(),
  iron: z.number(),
  caffeine_mg: z.number().nullable().optional(),
  alcohol_g: z.number().nullable().optional(),
  target_exercise_calories_burned: z.number(),
  target_exercise_duration_minutes: z.number(),
  target_steps: z.number().nullable().optional(),
  protein_percentage: z.number().nullable(),
  carbs_percentage: z.number().nullable(),
  fat_percentage: z.number().nullable(),
  // Optional so older servers still parse: grams per kg of body weight or lean mass.
  protein_per_kg: z.number().nullable().optional(),
  carbs_per_kg: z.number().nullable().optional(),
  fat_per_kg: z.number().nullable().optional(),
  macro_reference_weight_kg: z.number().nullable().optional(),
  macro_per_kg_basis: z.enum(MACRO_WEIGHT_BASES).optional(),
  macro_per_kg: macroPerKgResolutionSchema.nullable().optional(),
  breakfast_percentage: z.number(),
  lunch_percentage: z.number(),
  dinner_percentage: z.number(),
  snacks_percentage: z.number(),
  custom_nutrients: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional(),
  custom_meal_percentages: z.record(z.string(), z.number()).optional(),
});

export type DailyGoalsResponse = z.infer<typeof dailyGoalsResponseSchema>;
