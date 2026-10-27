import { createFoodEntry } from './api/foodEntriesApi';
import { fetchMealTypes } from './api/mealTypesApi';
import { queryClient } from '../hooks/queryClient';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { getTodayDate } from '../utils/dateUtils';
import {
  buildFuelingEntryPayload,
  pickFuelingMealTypeId,
  type FuelingFoodRef,
} from '../utils/fuelingLog';

export interface LogFuelingPortionInput {
  productName: string;
  portionGrams: number;
  food?: FuelingFoodRef | null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Logs one fueling portion to today's diary, for the reminder's Log it action.
 * Throws when there is no meal to put it in or the server refuses, so the
 * caller can tell the person it did not go through.
 */
export async function logFuelingPortion(
  input: LogFuelingPortionInput,
  now: Date = new Date()
): Promise<void> {
  const mealTypes = (await fetchMealTypes()).filter(
    (mealType) => mealType.is_visible
  );
  const mealTypeId = pickFuelingMealTypeId(mealTypes);
  if (!mealTypeId) throw new Error('No meal type available to log fuel into');

  const build = (food: LogFuelingPortionInput['food']) =>
    buildFuelingEntryPayload({
      productName: input.productName,
      portionGrams: input.portionGrams,
      food,
      mealTypeId,
      entryDate: getTodayDate(),
      entryTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });

  let entry;
  try {
    entry = await createFoodEntry(build(input.food));
  } catch (error) {
    // The saved food may have been deleted since the plan was made; the carbs
    // are still worth logging, so fall back to a standalone entry.
    if (!input.food) throw error;
    entry = await createFoodEntry(build(null));
  }
  invalidateFoodCache(queryClient, entry.entry_date);
}
