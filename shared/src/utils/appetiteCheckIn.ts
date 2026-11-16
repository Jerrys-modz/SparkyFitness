/**
 * Hunger, fullness and cravings check-in (the `appetite` optional feature).
 *
 * One daily check-in for everyone, on or off GLP-1 medication. The scores are
 * stored as daily numeric custom measurements, one category per metric, which
 * is how the GLP-1 daily check-in has always stored them. The two check-ins
 * are the same check-in: the GLP-1 card adds energy, and both read and write
 * the same rows, so a person never has two hunger values for one day.
 *
 * `categoryName` is the stable identifier matched on (the `GLP` prefix is
 * historical and must not be renamed or localized: existing rows hang off
 * it). Display names belong to each app's locale files, keyed by `key`.
 * Cravings are the GLP-1 check-in's "food noise" category.
 */

export const APPETITE_METRIC_KEYS = [
  'hunger',
  'fullness',
  'food_noise',
  'energy',
] as const;
export type AppetiteMetricKey = (typeof APPETITE_METRIC_KEYS)[number];

/** `appetite`: hunger, fullness and cravings. `glp1`: those plus energy. */
export type AppetiteCheckInVariant = 'appetite' | 'glp1';

export interface AppetiteMetric {
  key: AppetiteMetricKey;
  categoryName: string;
  /** Only asked in the GLP-1 check-in. */
  glp1Only: boolean;
}

export const APPETITE_METRICS: readonly AppetiteMetric[] = [
  { key: 'hunger', categoryName: 'GLP Hunger', glp1Only: false },
  { key: 'food_noise', categoryName: 'GLP Food Noise', glp1Only: false },
  { key: 'fullness', categoryName: 'GLP Fullness', glp1Only: false },
  { key: 'energy', categoryName: 'GLP Energy', glp1Only: true },
];

export const APPETITE_SCORE_MIN = 0;
export const APPETITE_SCORE_MAX = 10;
/** The value shown before anything is saved for the day. */
export const APPETITE_SCORE_DEFAULT = 5;

/** How a missing category is created on first save. */
export const APPETITE_CATEGORY_SETTINGS = {
  measurement_type: 'score (0–10)',
  frequency: 'Daily',
  data_type: 'numeric',
} as const;

export function appetiteMetricsFor(
  variant: AppetiteCheckInVariant
): AppetiteMetric[] {
  return APPETITE_METRICS.filter(
    (metric) => variant === 'glp1' || !metric.glp1Only
  );
}

export function appetiteMetric(key: AppetiteMetricKey): AppetiteMetric {
  const metric = APPETITE_METRICS.find((m) => m.key === key);
  if (!metric) throw new Error(`Unknown appetite metric: ${key}`);
  return metric;
}

/** Every category name the check-ins use, energy included. */
export const APPETITE_CATEGORY_NAMES: readonly string[] = APPETITE_METRICS.map(
  (metric) => metric.categoryName
);

export function isAppetiteCategoryName(
  name: string | null | undefined,
  variant: AppetiteCheckInVariant = 'glp1'
): boolean {
  return appetiteMetricsFor(variant).some(
    (metric) => metric.categoryName === name
  );
}

interface CategoryLike {
  id: string | number;
  name: string;
}

/** The category id of each metric that has a category yet. */
export function appetiteCategoryIds(
  categories: readonly CategoryLike[] | null | undefined
): Partial<Record<AppetiteMetricKey, string>> {
  const ids: Partial<Record<AppetiteMetricKey, string>> = {};
  for (const metric of APPETITE_METRICS) {
    const found = categories?.find((c) => c.name === metric.categoryName);
    if (found) ids[metric.key] = String(found.id);
  }
  return ids;
}

/** A stored score, or null when it is not a number in the scale. */
export function parseAppetiteScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < APPETITE_SCORE_MIN || parsed > APPETITE_SCORE_MAX) return null;
  return parsed;
}

interface MeasurementLike {
  category_id: string | number;
  value: unknown;
  entry_date: string;
}

/**
 * One day's scores: what is saved, else the default, and whether anything is
 * saved at all.
 */
export function appetiteValuesForDay(
  categories: readonly CategoryLike[] | null | undefined,
  dayEntries: readonly Omit<MeasurementLike, 'entry_date'>[] | null | undefined,
  variant: AppetiteCheckInVariant
): { values: Record<AppetiteMetricKey, number>; hasSaved: boolean } {
  const ids = appetiteCategoryIds(categories);
  const values = {} as Record<AppetiteMetricKey, number>;
  let hasSaved = false;
  for (const metric of APPETITE_METRICS) {
    const id = ids[metric.key];
    const entry = id
      ? dayEntries?.find((e) => String(e.category_id) === id)
      : undefined;
    const score = entry ? parseAppetiteScore(entry.value) : null;
    if (score !== null && appetiteMetricsFor(variant).includes(metric)) {
      hasSaved = true;
    }
    values[metric.key] = score ?? APPETITE_SCORE_DEFAULT;
  }
  return { values, hasSaved };
}

export interface AppetiteTrendDay {
  date: string;
  hunger: number | null;
  fullness: number | null;
  food_noise: number | null;
  energy: number | null;
  /** Calories eaten that day, null when nothing is logged. */
  calories: number | null;
}

/** The calendar day of a stored `entry_date` (a day or an ISO timestamp). */
function dayOf(entryDate: string): string {
  return entryDate.slice(0, 10);
}

/**
 * The days in a report with a score or calories, oldest first. When a day
 * holds several readings of one metric (only possible through another
 * client), the latest row wins, as the daily check-in shows.
 */
export function buildAppetiteTrend(
  categories: readonly CategoryLike[] | null | undefined,
  measurements: readonly MeasurementLike[] | null | undefined,
  nutrition:
    readonly { date: string; calories: number | null }[] | null | undefined
): AppetiteTrendDay[] {
  const ids = appetiteCategoryIds(categories);
  const keyById = new Map<string, AppetiteMetricKey>();
  for (const metric of APPETITE_METRICS) {
    const id = ids[metric.key];
    if (id) keyById.set(id, metric.key);
  }
  const byDay = new Map<string, AppetiteTrendDay>();
  const dayRow = (date: string): AppetiteTrendDay => {
    let row = byDay.get(date);
    if (!row) {
      row = {
        date,
        hunger: null,
        fullness: null,
        food_noise: null,
        energy: null,
        calories: null,
      };
      byDay.set(date, row);
    }
    return row;
  };
  let hasScore = false;
  for (const m of measurements ?? []) {
    const key = keyById.get(String(m.category_id));
    if (!key) continue;
    const score = parseAppetiteScore(m.value);
    if (score === null) continue;
    dayRow(dayOf(m.entry_date))[key] = score;
    hasScore = true;
  }
  if (!hasScore) return [];
  for (const n of nutrition ?? []) {
    if (n.calories === null || !Number.isFinite(n.calories) || n.calories <= 0)
      continue;
    dayRow(dayOf(n.date)).calories = n.calories;
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface AppetiteTrendSummary {
  /** Days with at least one hunger, fullness or cravings score. */
  daysLogged: number;
  averageHunger: number | null;
  averageFullness: number | null;
  averageCravings: number | null;
  /**
   * Average calories on days with a hunger score above / at or below the
   * person's own median hunger. Null unless both groups have a day with
   * calories, so a short range does not draw a conclusion.
   */
  caloriesOnHungrierDays: number | null;
  caloriesOnLessHungryDays: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function summarizeAppetiteTrend(
  days: readonly AppetiteTrendDay[]
): AppetiteTrendSummary {
  const scored = days.filter(
    (d) => d.hunger !== null || d.fullness !== null || d.food_noise !== null
  );
  const pick = (key: 'hunger' | 'fullness' | 'food_noise') =>
    scored.flatMap((d) => (d[key] === null ? [] : [d[key]]));
  const hungerMedian = median(pick('hunger'));
  let hungrier: number | null = null;
  let lessHungry: number | null = null;
  if (hungerMedian !== null) {
    const withBoth = days.filter(
      (d): d is AppetiteTrendDay & { hunger: number; calories: number } =>
        d.hunger !== null && d.calories !== null
    );
    const high = withBoth.filter((d) => d.hunger > hungerMedian);
    const low = withBoth.filter((d) => d.hunger <= hungerMedian);
    if (high.length > 0 && low.length > 0) {
      hungrier = mean(high.map((d) => d.calories));
      lessHungry = mean(low.map((d) => d.calories));
    }
  }
  return {
    daysLogged: scored.length,
    averageHunger: mean(pick('hunger')),
    averageFullness: mean(pick('fullness')),
    averageCravings: mean(pick('food_noise')),
    caloriesOnHungrierDays: hungrier,
    caloriesOnLessHungryDays: lessHungry,
  };
}
