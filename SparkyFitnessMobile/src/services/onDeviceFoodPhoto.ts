import type {
  FoodPhotoEstimateConfidence,
  FoodPhotoEstimateItem,
  FoodPhotoEstimateResponse,
} from '@workspace/shared';
import OnDeviceNutritionModule, {
  type OnDeviceMealEstimate,
} from '../../modules/on-device-nutrition';
import type { FoodsResponse } from '../types/foods';
import { fetchFoods } from './api/foodsApi';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

const MAX_ITEMS = 8;
const MAX_ITEM_GRAMS = 2000;
const MAX_ITEM_CALORIES = 3000;
const MAX_MEAL_CALORIES = 6000;
// Atwater energy from macros vs. the stated calories. Estimates are rough, so
// the band is wide; it only rejects numbers that cannot describe the same food.
const ENERGY_TOLERANCE = 0.4;

const MAX_KNOWN_FOODS = 40;
const MAX_KNOWN_FOODS_CHARS = 1200;
const KNOWN_FOODS_TIMEOUT_MS = 3000;

/**
 * Tells the model which foods the person already has, so an item that is one of
 * them is named the way the library names it and then matches it exactly. The
 * model on its own says "chips" where the library has "Ranch Flavor Tortilla
 * Chips", and a name that vague cannot be matched with any confidence.
 */
export function buildKnownFoodsHint(
  foods: Pick<FoodsResponse, 'recentFoods' | 'topFoods'> | undefined
): string | null {
  if (!foods) return null;
  const seen = new Set<string>();
  const names: string[] = [];
  let chars = 0;
  // Most-used first, then what was logged lately.
  const ranked = [
    ...[...(foods.topFoods ?? [])].sort(
      (a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0)
    ),
    ...(foods.recentFoods ?? []),
  ];
  for (const food of ranked) {
    const name = food.name?.trim();
    if (!name || food.is_quick_food) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (names.length >= MAX_KNOWN_FOODS) break;
    if (chars + name.length > MAX_KNOWN_FOODS_CHARS) break;
    seen.add(key);
    names.push(name);
    chars += name.length + 2;
  }
  if (names.length === 0) return null;
  return (
    `Foods this person has saved: ${names.join('; ')}. When an item in the ` +
    'photo is one of these, use exactly that name. Otherwise name each food ' +
    'specifically, for example "tortilla chips" rather than "chips".'
  );
}

/** The person's known foods, or nothing when offline or slow. */
async function loadKnownFoodsHint(): Promise<string | null> {
  try {
    const foods = await Promise.race([
      fetchFoods(),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), KNOWN_FOODS_TIMEOUT_MS)
      ),
    ]);
    return buildKnownFoodsHint(foods);
  } catch {
    return null;
  }
}

/** More photos than this crowd the small model's context window. */
export const MAX_ON_DEVICE_PHOTOS = 4;

export interface OnDeviceFoodPhotoInput {
  /** One meal, from one or more angles. */
  base64Images: string[];
  description?: string;
  /** Total weight of the meal in grams. */
  totalWeightGrams?: number;
}

export function isOnDeviceFoodPhotoAvailable(): boolean {
  return isOnDeviceLabelScanAvailable();
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Rejects an estimate that cannot be a real meal so the caller falls back to
 * the server instead of showing invented numbers.
 */
export function isPlausibleMealEstimate(r: OnDeviceMealEstimate): boolean {
  if (r.items.length === 0 || r.items.length > MAX_ITEMS) return false;
  let mealCalories = 0;
  for (const item of r.items) {
    if (!item.name.trim()) return false;
    const values = [
      item.grams,
      item.calories,
      item.protein,
      item.carbs,
      item.fat,
      item.fiber,
      item.sugar,
    ];
    if (!values.every(isFiniteNonNegative)) return false;
    if (item.grams <= 0 || item.grams > MAX_ITEM_GRAMS) return false;
    if (item.calories > MAX_ITEM_CALORIES) return false;
    if (item.sugar > item.carbs + 0.5 || item.fiber > item.carbs + 0.5) {
      return false;
    }
    const atwater = item.protein * 4 + item.carbs * 4 + item.fat * 9;
    if (item.calories > 20 && atwater > 0) {
      if (
        Math.abs(item.calories - atwater) / Math.max(item.calories, atwater) >
        ENERGY_TOLERANCE
      ) {
        return false;
      }
    }
    mealCalories += item.calories;
  }
  return mealCalories <= MAX_MEAL_CALORIES;
}

function toConfidence(value: string): FoodPhotoEstimateConfidence {
  const v = value.trim().toLowerCase();
  return v === 'high' || v === 'medium' ? v : 'low';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toFoodPhotoEstimate(
  r: OnDeviceMealEstimate
): FoodPhotoEstimateResponse {
  const items: FoodPhotoEstimateItem[] = r.items.map((item, index) => ({
    item_id: `on-device-${index}`,
    name: item.name.trim(),
    canonical_name: item.name.trim().toLowerCase(),
    estimated_grams: Math.round(item.grams),
    portion_description: item.portion.trim(),
    preparation: '',
    calories_kcal: Math.round(item.calories),
    protein_g: round1(item.protein),
    carbs_g: round1(item.carbs),
    fat_g: round1(item.fat),
    fiber_g: round1(item.fiber),
    sugar_g: round1(item.sugar),
    item_confidence: toConfidence(item.confidence),
    assumptions: [],
  }));
  const sum = (pick: (i: FoodPhotoEstimateItem) => number) =>
    items.reduce((total, i) => total + pick(i), 0);
  // An estimate is only as sure as its least sure item.
  const overall: FoodPhotoEstimateConfidence = items.some(
    (i) => i.item_confidence === 'low'
  )
    ? 'low'
    : items.some((i) => i.item_confidence === 'medium')
      ? 'medium'
      : 'high';
  return {
    meal_summary: r.summary.trim(),
    overall_confidence: overall,
    confidence_reason: 'Estimated on this iPhone from the photo alone.',
    items,
    totals: {
      total_grams: sum((i) => i.estimated_grams),
      calories_kcal: sum((i) => i.calories_kcal),
      protein_g: round1(sum((i) => i.protein_g)),
      carbs_g: round1(sum((i) => i.carbs_g)),
      fat_g: round1(sum((i) => i.fat_g)),
      fiber_g: round1(sum((i) => i.fiber_g)),
      sugar_g: round1(sum((i) => i.sugar_g)),
    },
    user_weight_reconciliation: '',
    clarifying_questions: [],
  };
}

/**
 * Estimates a meal photo with Apple's on-device model. Returns null whenever
 * the on-device path is off, unavailable, fails, or returns implausible
 * numbers; the caller then uses the server-side estimate.
 */
export async function estimateFoodPhotoOnDevice(
  input: OnDeviceFoodPhotoInput
): Promise<FoodPhotoEstimateResponse | null> {
  if (!useAppPreferencesStore.getState().onDeviceFoodPhotoEnabled) return null;
  if (!OnDeviceNutritionModule || !isOnDeviceFoodPhotoAvailable()) return null;
  if (
    input.base64Images.length === 0 ||
    input.base64Images.length > MAX_ON_DEVICE_PHOTOS
  ) {
    return null;
  }
  try {
    const userNotes = useAppPreferencesStore.getState().aiUserContext.trim();
    const knownFoods = await loadKnownFoodsHint();
    const context = [userNotes, knownFoods].filter(Boolean).join('\n\n');
    const estimate = await OnDeviceNutritionModule.estimateMeal(
      input.base64Images,
      input.description?.trim() || null,
      input.totalWeightGrams ?? null,
      context || null
    );
    if (!isPlausibleMealEstimate(estimate)) {
      addLog(
        '[Food Photo] On-device estimate implausible; falling back',
        'INFO'
      );
      return null;
    }
    return toFoodPhotoEstimate(estimate);
  } catch (error) {
    addLog(
      `[Food Photo] On-device estimate failed: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return null;
  }
}

/** Whether an estimate was made by the on-device model (see `toFoodPhotoEstimate`). */
export function isOnDeviceEstimate(
  estimate: Pick<FoodPhotoEstimateResponse, 'items'>
): boolean {
  return estimate.items.some((item) => item.item_id?.startsWith('on-device-'));
}

/** Whether the on-device estimate can run for this many photos right now. */
export function canEstimateOnDevice(photoCount: number): boolean {
  return (
    useAppPreferencesStore.getState().onDeviceFoodPhotoEnabled &&
    isOnDeviceFoodPhotoAvailable() &&
    photoCount >= 1 &&
    photoCount <= MAX_ON_DEVICE_PHOTOS
  );
}
