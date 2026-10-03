import { Alert } from 'react-native';
import { fetchDailySummary } from './api/dailySummaryApi';
import { createFoodEntry } from './api/foodEntriesApi';
import { searchFoods } from './api/foodsApi';
import { fetchMealTypes } from './api/mealTypesApi';
import { upsertCheckIn } from './api/measurementsApi';
import { addLog } from './LogService';
import { queryClient } from '../hooks/queryClient';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { getTodayDate } from '../utils/dateUtils';
import { buildChatContext } from '../utils/onDeviceChatContext';
import type { FoodItem } from '../types/foods';
import type { MealType } from '../types/mealTypes';

const MAX_RESULTS = 5;
const MAX_SERVINGS = 20;
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;
const DECLINED = 'The user declined, so nothing was saved.';

/** The foods the model last saw, by the number it was shown. */
let lastSearch: FoodItem[] = [];

export function resetChatToolState(): void {
  lastSearch = [];
}

const round = (n: number | undefined | null): number => Math.round(n ?? 0);

export function formatSearchResults(foods: FoodItem[]): string {
  if (foods.length === 0) return 'No foods found.';
  return foods
    .map((f, i) => {
      const v = f.default_variant;
      const brand = f.brand ? ` (${f.brand})` : '';
      return `${i + 1}. ${f.name}${brand}: ${round(v.calories)} kcal, ${round(v.protein)} g protein per ${v.serving_size} ${v.serving_unit}`;
    })
    .join('\n');
}

/** Picks the meal whose name matches what the model said, ignoring case. */
export function resolveMealType(
  mealTypes: MealType[],
  name: string
): MealType | null {
  const wanted = name.trim().toLowerCase();
  const visible = mealTypes.filter((m) => m.is_visible);
  return (
    visible.find((m) => m.name.toLowerCase() === wanted) ??
    visible.find(
      (m) =>
        wanted.length > 0 &&
        (m.name.toLowerCase().includes(wanted) ||
          wanted.includes(m.name.toLowerCase()))
    ) ??
    null
  );
}

function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Log it', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

async function getDaySummary(args: { date?: string }): Promise<string> {
  const date =
    args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
      ? args.date
      : getTodayDate();
  return buildChatContext(await fetchDailySummary(date), date);
}

async function searchFoodsTool(args: { query?: string }): Promise<string> {
  const query = (args.query ?? '').trim();
  if (!query) return 'Give a food name to search for.';
  const result = await searchFoods(query);
  lastSearch = result.foods.slice(0, MAX_RESULTS);
  return formatSearchResults(lastSearch);
}

async function logFood(args: {
  resultNumber?: number;
  servings?: number;
  meal?: string;
}): Promise<string> {
  const food = lastSearch[(args.resultNumber ?? 0) - 1];
  if (!food) return 'Unknown result number. Call searchFoods first.';
  const servings = args.servings ?? 1;
  if (!(servings > 0) || servings > MAX_SERVINGS) {
    return `Servings must be between 0 and ${MAX_SERVINGS}.`;
  }
  const variant = food.default_variant;
  if (!variant?.id) return 'That food has no serving to log.';
  const mealTypes = await fetchMealTypes();
  const meal = resolveMealType(mealTypes, args.meal ?? '');
  if (!meal) {
    return `Unknown meal. Choose one of: ${mealTypes
      .filter((m) => m.is_visible)
      .map((m) => m.name)
      .join(', ')}.`;
  }
  const kcal = round(variant.calories * servings);
  const ok = await confirm(
    'Log this food?',
    `${servings} × ${food.name} (${variant.serving_size} ${variant.serving_unit}), about ${kcal} kcal, to ${meal.name}.`
  );
  if (!ok) return DECLINED;
  const date = getTodayDate();
  await createFoodEntry({
    meal_type_id: meal.id,
    food_id: food.id,
    variant_id: variant.id,
    quantity: servings * variant.serving_size,
    unit: variant.serving_unit,
    entry_date: date,
  });
  invalidateFoodCache(queryClient, date);
  return `Logged ${servings} × ${food.name} to ${meal.name} (${kcal} kcal).`;
}

async function logWeight(args: { kilograms?: number }): Promise<string> {
  const kg = args.kilograms ?? 0;
  if (!(kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG)) {
    return `A weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
  }
  const ok = await confirm('Record weight?', `${kg} kg for today.`);
  if (!ok) return DECLINED;
  await upsertCheckIn({ entryDate: getTodayDate(), weight: kg });
  void queryClient.invalidateQueries();
  return `Recorded ${kg} kg for today.`;
}

/** Runs one tool the model asked for. Never throws: errors go back as text. */
export async function runChatTool(
  name: string,
  argsJson: string
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return 'The arguments were not valid.';
  }
  try {
    switch (name) {
      case 'getDaySummary':
        return await getDaySummary(args as { date?: string });
      case 'searchFoods':
        return await searchFoodsTool(args as { query?: string });
      case 'logFood':
        return await logFood(args as Parameters<typeof logFood>[0]);
      case 'logWeight':
        return await logWeight(args as { kilograms?: number });
      default:
        return `Unknown tool ${name}.`;
    }
  } catch (error) {
    addLog(`On-device chat tool ${name} failed: ${error}`, 'ERROR');
    return 'That did not work. Tell the user something went wrong.';
  }
}
