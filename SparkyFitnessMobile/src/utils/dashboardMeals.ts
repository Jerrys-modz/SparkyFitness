import type { FoodEntry } from '../types/foodEntries';
import type { MealType } from '../types/mealTypes';
import { groupFoodEntriesByMealType, type MealGroup } from './mealNutrition';

/**
 * The rows of the Dashboard's Meals card: every visible meal type in its saved order,
 * empty ones included so each can be added to, then any hidden, deleted or legacy type
 * that still holds food that day (the Diary shows those too, so the food never goes
 * missing from the Dashboard).
 */
export function buildDashboardMealRows(
  foodEntries: FoodEntry[],
  mealTypes: MealType[]
): MealGroup[] {
  const logged = groupFoodEntriesByMealType(foodEntries, mealTypes);
  const loggedById = new Map(
    logged
      .filter((group) => group.mealTypeId != null)
      .map((group) => [group.mealTypeId, group])
  );
  const visible = [...mealTypes]
    .filter((mealType) => mealType.is_visible)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  const visibleIds = new Set(visible.map((mealType) => mealType.id));

  const rows: MealGroup[] = visible.map(
    (mealType) =>
      loggedById.get(mealType.id) ?? {
        mealTypeId: mealType.id,
        name: mealType.name,
        sortOrder: mealType.sort_order ?? 999,
        entries: [],
        isSystem: mealType.user_id === null,
      }
  );
  for (const group of logged) {
    if (group.mealTypeId == null || !visibleIds.has(group.mealTypeId)) {
      rows.push(group);
    }
  }
  return rows;
}

/** "Black Coffee, Rolled Oats" or "Black Coffee, Rolled Oats +2": what a meal held. */
export function summarizeMealFoods(
  entries: FoodEntry[],
  maxNames = 2
): { names: string[]; more: number } {
  const names = entries
    .map((entry) => entry.food_name?.trim())
    .filter((name): name is string => Boolean(name));
  return {
    names: names.slice(0, maxNames),
    more: Math.max(0, names.length - maxNames),
  };
}
