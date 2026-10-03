import { Alert } from 'react-native';
import { fetchDailySummary } from './api/dailySummaryApi';
import { createFoodEntry, deleteFoodEntry } from './api/foodEntriesApi';
import { searchFoods } from './api/foodsApi';
import { fetchMealTypes } from './api/mealTypesApi';
import {
  changeWaterIntake,
  fetchMeasurementsRange,
  fetchWaterContainers,
  upsertCheckIn,
} from './api/measurementsApi';
import { addLog } from './LogService';
import { queryClient } from '../hooks/queryClient';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { getServingVolume } from '../utils/unitConversions';
import { buildChatContext } from '../utils/onDeviceChatContext';
import type { FoodItem } from '../types/foods';
import type { MealType } from '../types/mealTypes';
import type { FoodEntry } from '../types/foodEntries';

const MAX_RESULTS = 5;
const MAX_SERVINGS = 20;
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;
const MAX_WATER_ML = 3000;
const MAX_QUICK_CALORIES = 5000;
const MAX_HISTORY_DAYS = 30;
const DECLINED = 'The user declined, so nothing was saved.';

/** The foods the model last saw, by the number it was shown. */
let lastSearch: FoodItem[] = [];
/** The diary entries the model last saw, by the number it was shown. */
let lastEntries: FoodEntry[] = [];

export function resetChatToolState(): void {
  lastSearch = [];
  lastEntries = [];
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

function confirm(
  title: string,
  message: string,
  confirmText = 'Log it'
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, onPress: () => resolve(true) },
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

const validDate = (d?: string): string =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : getTodayDate();

export function formatEntryList(entries: FoodEntry[]): string {
  if (entries.length === 0) return 'No foods logged that day.';
  return entries
    .map(
      (e, i) =>
        `${i + 1}. ${e.meal_type}: ${e.food_name ?? 'Food'} (${round(e.calories)} kcal)`
    )
    .join('\n');
}

async function logQuickFood(args: {
  foodName?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  meal?: string;
}): Promise<string> {
  const name = (args.foodName ?? '').trim();
  if (!name) return 'A food name is required.';
  const calories = args.calories ?? 0;
  if (!(calories >= 0 && calories <= MAX_QUICK_CALORIES)) {
    return `Calories must be between 0 and ${MAX_QUICK_CALORIES}.`;
  }
  const mealTypes = await fetchMealTypes();
  const meal = resolveMealType(mealTypes, args.meal ?? '');
  if (!meal) {
    return `Unknown meal. Choose one of: ${mealTypes
      .filter((m) => m.is_visible)
      .map((m) => m.name)
      .join(', ')}.`;
  }
  const protein = Math.max(0, args.protein ?? 0);
  const carbs = Math.max(0, args.carbs ?? 0);
  const fat = Math.max(0, args.fat ?? 0);
  const ok = await confirm(
    'Log this estimate?',
    `${name}: about ${round(calories)} kcal (${round(protein)} g protein, ${round(carbs)} g carbs, ${round(fat)} g fat), to ${meal.name}. These numbers are an estimate.`
  );
  if (!ok) return DECLINED;
  const date = getTodayDate();
  await createFoodEntry({
    meal_type_id: meal.id,
    food_name: name,
    quantity: 1,
    unit: 'serving',
    serving_size: 1,
    serving_unit: 'serving',
    calories,
    protein,
    carbs,
    fat,
    entry_date: date,
  });
  invalidateFoodCache(queryClient, date);
  return `Logged ${name} to ${meal.name} (${round(calories)} kcal, estimated).`;
}

async function logWater(args: { milliliters?: number }): Promise<string> {
  const ml = args.milliliters ?? 0;
  if (!(ml > 0 && ml <= MAX_WATER_ML)) {
    return `Water must be between 0 and ${MAX_WATER_ML} ml.`;
  }
  const containers = await fetchWaterContainers();
  const container =
    containers.find((c) => c.is_primary && getServingVolume(c) != null) ??
    containers.find((c) => getServingVolume(c) != null);
  const perDrink = container ? getServingVolume(container) : null;
  if (!container || !perDrink || perDrink <= 0) {
    return 'No water container with a set volume is configured.';
  }
  const drinks = Math.max(1, Math.round(ml / perDrink));
  const actualMl = Math.round(drinks * perDrink);
  const ok = await confirm(
    'Log water?',
    `${actualMl} ml (${drinks} × ${container.name}) for today.`
  );
  if (!ok) return DECLINED;
  const date = getTodayDate();
  await changeWaterIntake({
    entryDate: date,
    changeDrinks: drinks,
    containerId: container.id,
  });
  invalidateFoodCache(queryClient, date);
  return `Logged ${actualMl} ml of water.`;
}

async function listFoodEntries(args: { date?: string }): Promise<string> {
  const summary = await fetchDailySummary(validDate(args.date));
  lastEntries = summary.foodEntries ?? [];
  return formatEntryList(lastEntries);
}

async function deleteEntry(args: { entryNumber?: number }): Promise<string> {
  const entry = lastEntries[(args.entryNumber ?? 0) - 1];
  if (!entry) return 'Unknown entry number. Call listFoodEntries first.';
  const ok = await confirm(
    'Delete this entry?',
    `${entry.food_name ?? 'Food'} (${round(entry.calories)} kcal) from ${entry.meal_type}.`,
    'Delete'
  );
  if (!ok) return DECLINED;
  await deleteFoodEntry(entry.id);
  invalidateFoodCache(queryClient, entry.entry_date);
  lastEntries = lastEntries.filter((e) => e.id !== entry.id);
  return `Deleted ${entry.food_name ?? 'the entry'}.`;
}

async function getHistory(args: {
  kind?: string;
  days?: number;
}): Promise<string> {
  const days = Math.min(
    MAX_HISTORY_DAYS,
    Math.max(1, Math.round(args.days ?? 7))
  );
  const today = getTodayDate();
  const from = addDays(today, -(days - 1));
  const kind = (args.kind ?? '').toLowerCase();
  if (kind.startsWith('weight')) {
    const rows = await fetchMeasurementsRange(from, today);
    const weights = rows
      .filter((r) => r.weight != null)
      .map((r) => `${r.entry_date}: ${r.weight} kg`);
    return weights.length > 0 ? weights.join('\n') : 'No weights recorded.';
  }
  if (kind.startsWith('workout')) {
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const summaries = await Promise.all(
      dates.map((d) => fetchDailySummary(d).catch(() => null))
    );
    const lines: string[] = [];
    summaries.forEach((s, i) => {
      const names = (s?.exerciseSessions ?? []).map((w) => w.name);
      if (names.length > 0) lines.push(`${dates[i]}: ${names.join(', ')}`);
    });
    return lines.length > 0 ? lines.join('\n') : 'No workouts in that time.';
  }
  return 'Kind must be weight or workouts.';
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
      case 'logQuickFood':
        return await logQuickFood(args as Parameters<typeof logQuickFood>[0]);
      case 'logWater':
        return await logWater(args as { milliliters?: number });
      case 'listFoodEntries':
        return await listFoodEntries(args as { date?: string });
      case 'deleteFoodEntry':
        return await deleteEntry(args as { entryNumber?: number });
      case 'getHistory':
        return await getHistory(args as { kind?: string; days?: number });
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
