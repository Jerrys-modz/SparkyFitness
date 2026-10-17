import type { CreateFoodEntryPayload } from '../api/foodEntriesApi';
import type { FoodEntry } from '../../types/foodEntries';
import { pendingEntryId } from './overlay';

/** Per-serving nutrition of the food as the add screen shows it. */
export interface PendingFoodNutrition {
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  saturatedFat?: number;
  sodium?: number;
  sugars?: number;
  transFat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  caffeineMg?: number;
  waterMl?: number;
  alcoholG?: number;
  cholesterol?: number;
  vitaminA?: number;
  vitaminC?: number;
}

export interface PendingFoodPreviewInput {
  foodName: string;
  brandName?: string | null;
  mealTypeName: string;
  nutrition: PendingFoodNutrition;
}

/**
 * What the diary shows for a food entry that is still in the queue: the same
 * snapshot the server would write (per-serving nutrition plus the quantity),
 * under a `pending:` id that no server row can have.
 */
export function buildPendingFoodEntry(
  queueId: string,
  payload: CreateFoodEntryPayload,
  input: PendingFoodPreviewInput
): FoodEntry {
  const n = input.nutrition;
  return {
    id: pendingEntryId(queueId),
    food_id: payload.food_id,
    variant_id: payload.variant_id,
    meal_id: payload.meal_id,
    meal_type: input.mealTypeName,
    meal_type_id: payload.meal_type_id,
    quantity: payload.quantity,
    unit: payload.unit,
    notes: payload.notes ?? null,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time ?? null,
    food_name: input.foodName,
    brand_name: input.brandName ?? undefined,
    serving_size: n.servingSize,
    serving_unit: n.servingUnit,
    calories: n.calories,
    protein: n.protein,
    carbs: n.carbs,
    fat: n.fat,
    dietary_fiber: n.fiber,
    saturated_fat: n.saturatedFat,
    sodium: n.sodium,
    sugars: n.sugars,
    trans_fat: n.transFat,
    potassium: n.potassium,
    calcium: n.calcium,
    iron: n.iron,
    caffeine_mg: n.caffeineMg,
    water_ml: n.waterMl,
    alcohol_g: n.alcoholG,
    cholesterol: n.cholesterol,
    vitamin_a: n.vitaminA,
    vitamin_c: n.vitaminC,
  };
}
