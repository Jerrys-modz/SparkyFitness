import type { WatchGoalNutrientPayload } from '../../modules/watch-connectivity';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import { DEFAULT_WATCH_NUTRIENTS } from '../constants/watchPages';
import type { NutrientDisplayPreference } from '../services/api/preferencesApi';
import type { DailySummary } from '../types/dailySummary';
import { dayCustomNutrient, dayStandardNutrient } from './nutrientUtils';

type Translator = (key: string, options: { defaultValue: string }) => string;

const SERVER_DEFAULT_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'sugars',
  'caffeine_mg',
  'alcohol_g',
];

/**
 * Checks whether two string arrays have identical length and elements in order.
 */
function isSameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

/**
 * Standard nutrients the watch's Goals page can list. Calories are the ring
 * above the rows, and the glycemic index is a category rather than an amount,
 * so neither can be a row.
 */
export const WATCH_STANDARD_NUTRIENT_KEYS = Object.keys(NUTRIENT_META).filter(
  (key) => key !== 'calories' && key !== 'glycemic_index'
);

/**
 * The shown keys, in the saved order. A shown key the order doesn't mention
 * yet goes on the end, in the order it was turned on.
 */
export function shownInOrder(
  order: readonly string[],
  shown: readonly string[]
): string[] {
  return [
    ...order.filter((key) => shown.includes(key)),
    ...shown.filter((key) => !order.includes(key)),
  ];
}

/**
 * Resolves the ordered nutrient keys for the watch Goals page and Nutrition tile.
 *
 * Uses explicit watch nutrient settings (`watchOrder` / `shownWatch`) when the
 * user customized them; otherwise falls back to the user's Nutrient Display
 * preferences (`summary`, `food_database`, `report_tabular`, or `goal`), and
 * finally to `DEFAULT_WATCH_NUTRIENTS`.
 */
export function resolveWatchNutrientKeys(
  watchOrder: readonly string[],
  shownWatch: readonly string[],
  nutrientDisplayPreferences?: readonly NutrientDisplayPreference[]
): string[] {
  const watchCustomized =
    watchOrder.length > 0 || !isSameList(shownWatch, DEFAULT_WATCH_NUTRIENTS);
  if (watchCustomized) {
    return shownInOrder(watchOrder, shownWatch);
  }

  if (nutrientDisplayPreferences && nutrientDisplayPreferences.length > 0) {
    const candidates: [string, string][] = [
      ['summary', 'mobile'],
      ['food_database', 'mobile'],
      ['report_tabular', 'mobile'],
      ['goal', 'mobile'],
      ['summary', 'desktop'],
      ['goal', 'desktop'],
    ];
    for (const [group, platform] of candidates) {
      const row = nutrientDisplayPreferences.find(
        (p) => p.view_group === group && p.platform === platform
      );
      if (
        row &&
        row.visible_nutrients.length > 0 &&
        !isSameList(row.visible_nutrients, SERVER_DEFAULT_NUTRIENTS)
      ) {
        const filtered = row.visible_nutrients.filter(
          (k) => k !== 'calories' && k !== 'glycemic_index'
        );
        if (filtered.length > 0) return filtered;
      }
    }
    const summaryRow =
      nutrientDisplayPreferences.find(
        (p) => p.view_group === 'summary' && p.platform === 'mobile'
      ) ??
      nutrientDisplayPreferences.find(
        (p) => p.view_group === 'food_database' && p.platform === 'mobile'
      );
    if (summaryRow) {
      const filtered = summaryRow.visible_nutrients.filter(
        (k) => k !== 'calories' && k !== 'glycemic_index'
      );
      if (filtered.length > 0) return filtered;
    }
  }

  return shownInOrder(watchOrder, shownWatch);
}

/**
 * The Goals page's rows for the day: each nutrient's amount, goal and fill,
 * labelled and in the wearer's order. A key that is neither a standard
 * nutrient nor one of `customUnits` (a custom nutrient since deleted) is
 * dropped rather than shown as a zero.
 */
export function buildWatchGoalNutrients(
  summary: DailySummary,
  keys: readonly string[],
  customUnits: ReadonlyMap<string, string>,
  t: Translator
): WatchGoalNutrientPayload[] {
  return keys.flatMap((key) => {
    const meta = WATCH_STANDARD_NUTRIENT_KEYS.includes(key)
      ? NUTRIENT_META[key]
      : undefined;
    const customUnit = customUnits.get(key);
    if (!meta && customUnit === undefined) return [];
    const { consumed, goal } = meta
      ? dayStandardNutrient(summary, key)
      : dayCustomNutrient(summary, key);
    return [
      {
        key,
        label: meta ? getNutrientLabel(t, key) : key,
        unit: meta ? meta.unit : customUnit || 'g',
        consumed,
        goal: goal ?? null,
        progress: goal ? Math.max(0, Math.min(1, consumed / goal)) : 0,
      },
    ];
  });
}
