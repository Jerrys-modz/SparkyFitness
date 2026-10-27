import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { MealType } from '../types/mealTypes';
import { getDefaultMealTypeId } from '../constants/meals';

/** Energy in carbohydrate, kcal per gram. */
export const KCAL_PER_GRAM_CARBS = 4;

/** The diary meal a fueling portion goes in: Snacks, else the one for this time of day. */
export function pickFuelingMealTypeId(mealTypes: MealType[]): string | null {
  const snacks = mealTypes.find(
    (mealType) => mealType.name.trim().toLowerCase() === 'snacks'
  );
  return snacks?.id ?? getDefaultMealTypeId(mealTypes);
}

export interface FuelingEntryInput {
  productName: string;
  portionGrams: number;
  mealTypeId: string;
  /** `YYYY-MM-DD` in the person's local day. */
  entryDate: string;
  /** `HH:MM`, 24 hour. */
  entryTime: string;
}

/**
 * A standalone diary entry for one portion: it carries its own nutrition, so it
 * needs no saved food and cannot be changed by editing one later.
 */
export function buildFuelingEntryPayload(
  input: FuelingEntryInput
): CreateFoodEntryPayload {
  return {
    meal_type_id: input.mealTypeId,
    entry_date: input.entryDate,
    entry_time: input.entryTime,
    quantity: 1,
    unit: 'serving',
    food_name: input.productName,
    serving_size: 1,
    serving_unit: 'serving',
    carbs: input.portionGrams,
    calories: Math.round(input.portionGrams * KCAL_PER_GRAM_CARBS),
    protein: 0,
    fat: 0,
  };
}
