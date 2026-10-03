import { requestChatConfirm } from '../stores/chatConfirmStore';
import { fetchDailySummary } from './api/dailySummaryApi';
import {
  copyFoodEntries,
  createFoodEntry,
  deleteFoodEntry,
} from './api/foodEntriesApi';
import { endFast, fetchCurrentFast, startFast } from './api/fastingApi';
import { createExerciseEntry, searchExercises } from './api/exerciseApi';
import { fetchSleepEntries } from './api/sleepApi';
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
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from './dailySummaryService';
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
const MAX_FAST_HOURS = 72;
const MAX_EXERCISE_MINUTES = 600;
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
  return requestChatConfirm({ title, message, confirmText });
}

async function getDaySummary(args: { date?: string }): Promise<string> {
  const date =
    args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
      ? args.date
      : getTodayDate();
  return buildChatContext(
    buildDailySummary(date, await loadDailySummaryRawData(date)),
    date
  );
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

const hoursText = (minutes: number): string =>
  `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;

async function getFasting(): Promise<string> {
  const fast = await fetchCurrentFast();
  if (!fast) return 'No fast is running.';
  const elapsed = (Date.now() - new Date(fast.start_time).getTime()) / 60000;
  const target = fast.target_end_time
    ? ` Target end ${fast.target_end_time}.`
    : '';
  return `Fasting for ${hoursText(Math.max(0, elapsed))} (${fast.fasting_type ?? 'fast'}).${target}`;
}

async function startFastTool(args: { hours?: number }): Promise<string> {
  const hours = args.hours ?? 0;
  if (!(hours > 0 && hours <= MAX_FAST_HOURS)) {
    return `A fast must be between 0 and ${MAX_FAST_HOURS} hours.`;
  }
  if (await fetchCurrentFast()) return 'A fast is already running.';
  const ok = await confirm(
    'Start a fast?',
    `${hours} h, starting now.`,
    'Start'
  );
  if (!ok) return DECLINED;
  const start = new Date();
  await startFast({
    startTime: start.toISOString(),
    targetEndTime: new Date(start.getTime() + hours * 3600000).toISOString(),
    fastingType: `${hours}h`,
  });
  void queryClient.invalidateQueries();
  return `Started a ${hours} hour fast.`;
}

async function endFastTool(): Promise<string> {
  const fast = await fetchCurrentFast();
  if (!fast) return 'No fast is running.';
  const elapsed = (Date.now() - new Date(fast.start_time).getTime()) / 60000;
  const ok = await confirm(
    'End your fast?',
    `You have fasted ${hoursText(Math.max(0, elapsed))}.`,
    'End fast'
  );
  if (!ok) return DECLINED;
  await endFast({
    id: fast.id,
    startTime: fast.start_time,
    endTime: new Date().toISOString(),
  });
  void queryClient.invalidateQueries();
  return `Ended the fast after ${hoursText(Math.max(0, elapsed))}.`;
}

async function getSleep(args: { days?: number }): Promise<string> {
  const days = Math.min(14, Math.max(1, Math.round(args.days ?? 7)));
  const today = getTodayDate();
  const entries = await fetchSleepEntries(addDays(today, -(days - 1)), today);
  if (entries.length === 0) return 'No sleep recorded.';
  return entries
    .map((e) => {
      const asleep = e.time_asleep_in_seconds ?? e.duration_in_seconds;
      const score = e.sleep_score != null ? `, score ${e.sleep_score}` : '';
      return `${e.entry_date}: ${hoursText(asleep / 60)} asleep${score}`;
    })
    .join('\n');
}

async function logExercise(args: {
  activity?: string;
  minutes?: number;
  caloriesBurned?: number;
}): Promise<string> {
  const activity = (args.activity ?? '').trim();
  const minutes = args.minutes ?? 0;
  if (!activity) return 'An activity name is required.';
  if (!(minutes > 0 && minutes <= MAX_EXERCISE_MINUTES)) {
    return `Minutes must be between 0 and ${MAX_EXERCISE_MINUTES}.`;
  }
  const matches = await searchExercises(activity);
  const exercise = matches[0];
  if (!exercise) return `No exercise named ${activity} was found.`;
  const calories = Math.max(0, Math.round(args.caloriesBurned ?? 0));
  const ok = await confirm(
    'Log this activity?',
    `${exercise.name}, ${Math.round(minutes)} min${calories ? `, about ${calories} kcal` : ''}.`
  );
  if (!ok) return DECLINED;
  const date = getTodayDate();
  await createExerciseEntry({
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    duration_minutes: minutes,
    calories_burned: calories,
    entry_date: date,
  });
  invalidateFoodCache(queryClient, date);
  void queryClient.invalidateQueries();
  return `Logged ${exercise.name} for ${Math.round(minutes)} minutes.`;
}

async function copyMeal(args: {
  fromDay?: string;
  fromMeal?: string;
  toMeal?: string;
}): Promise<string> {
  const today = getTodayDate();
  const day = (args.fromDay ?? '').trim().toLowerCase();
  const sourceDate =
    day === 'yesterday' || day === ''
      ? addDays(today, -1)
      : /^\d{4}-\d{2}-\d{2}$/.test(day)
        ? day
        : null;
  if (!sourceDate) return 'Use yesterday or a date as YYYY-MM-DD.';
  const mealTypes = await fetchMealTypes();
  const from = resolveMealType(mealTypes, args.fromMeal ?? '');
  const to = resolveMealType(mealTypes, args.toMeal ?? '');
  if (!from || !to) {
    return `Unknown meal. Choose from: ${mealTypes
      .filter((m) => m.is_visible)
      .map((m) => m.name)
      .join(', ')}.`;
  }
  const ok = await confirm(
    'Copy this meal?',
    `Everything in ${from.name} on ${sourceDate}, into ${to.name} today.`,
    'Copy'
  );
  if (!ok) return DECLINED;
  await copyFoodEntries({
    sourceDate,
    sourceMealType: from.name,
    targetDate: today,
    targetMealType: to.name,
  });
  invalidateFoodCache(queryClient, today);
  return `Copied ${from.name} from ${sourceDate} into ${to.name}.`;
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
      case 'getFasting':
        return await getFasting();
      case 'startFast':
        return await startFastTool(args as { hours?: number });
      case 'endFast':
        return await endFastTool();
      case 'getSleep':
        return await getSleep(args as { days?: number });
      case 'logExercise':
        return await logExercise(args as Parameters<typeof logExercise>[0]);
      case 'copyMeal':
        return await copyMeal(args as Parameters<typeof copyMeal>[0]);
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
