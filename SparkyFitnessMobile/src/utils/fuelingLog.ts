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

/** A saved food (and the serving of it) that one portion stands for. */
export interface FuelingFoodRef {
  foodId: string;
  variantId: string;
  /** Amount and unit of the variant's serving, which is what one portion is. */
  servingSize: number;
  servingUnit: string;
}

export interface FuelingEntryInput {
  productName: string;
  portionGrams: number;
  /** When set, the entry points at this food and takes its nutrition. */
  food?: FuelingFoodRef | null;
  mealTypeId: string;
  /** `YYYY-MM-DD` in the person's local day. */
  entryDate: string;
  /** `HH:MM`, 24 hour. */
  entryTime: string;
}

/**
 * One portion as a diary entry. With a saved food it is one serving of that
 * food, so the server takes the nutrition from it. Without one it is a
 * standalone entry carrying its own carbs, which editing a food cannot change.
 */
export function buildFuelingEntryPayload(
  input: FuelingEntryInput
): CreateFoodEntryPayload {
  if (input.food) {
    return {
      meal_type_id: input.mealTypeId,
      entry_date: input.entryDate,
      entry_time: input.entryTime,
      quantity: input.food.servingSize,
      unit: input.food.servingUnit,
      food_id: input.food.foodId,
      variant_id: input.food.variantId,
    };
  }
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
