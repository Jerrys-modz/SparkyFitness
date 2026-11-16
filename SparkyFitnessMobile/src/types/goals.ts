import type {
  CalorieCyclingDay,
  MacroPerKgResolution,
  MacroWeightBasis,
} from '@workspace/shared';

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  caffeine_mg?: number;
  alcohol_g?: number;
  water_goal_ml?: number;
  target_exercise_calories_burned?: number;
  target_exercise_duration_minutes?: number;
  target_steps?: number;
  protein_percentage?: number;
  carbs_percentage?: number;
  fat_percentage?: number;
  /** Grams per kg of body weight or lean mass; null = grams or percentage. */
  protein_per_kg?: number | null;
  carbs_per_kg?: number | null;
  fat_per_kg?: number | null;
  macro_per_kg_basis?: MacroWeightBasis;
  /** Fixed reference weight in kg; null follows the latest logged weight. */
  macro_reference_weight_kg?: number | null;
  /** How the day's per-kg goal was resolved (sent by newer servers). */
  macro_per_kg?: MacroPerKgResolution | null;
  breakfast_percentage?: number;
  lunch_percentage?: number;
  dinner_percentage?: number;
  snacks_percentage?: number;
  custom_nutrients?: Record<string, string | number>;
  custom_meal_percentages?: Record<string, number>;
  calorie_cycling?: CalorieCyclingDay;
}

/** A saved set of goals the user can apply to the goals form. */
export interface GoalPreset extends DailyGoals {
  id?: string;
  preset_name: string;
}

export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Assigns a goal preset to each day of the week between two dates. */
export type WeeklyGoalPlan = {
  id?: string;
  plan_name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
} & Record<`${WeekdayKey}_preset_id`, string | null>;
