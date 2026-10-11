import type { NutritionTrendPoint } from '../services/api/reportsApi';
import type { CaloriesDataPoint } from '../types/healthTrends';
import { weekdayOfDay } from './dateUtils';
import { average } from './mathUtils';

/** A day's calories within this share of its goal counts as on target. */
export const GOAL_TOLERANCE = 0.1;

/** Nutrients averaged in the "Other nutrients" card, in display order. */
export const EXTRA_NUTRIENT_KEYS = [
  'dietary_fiber',
  'sugars',
  'sodium',
  'water_ml',
  'caffeine_mg',
  'alcohol_g',
] as const;

export type ExtraNutrientKey = (typeof EXTRA_NUTRIENT_KEYS)[number];

export interface MacroSplit {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
}

export interface GoalAdherence {
  /** Logged days that had a calorie goal. */
  daysWithGoal: number;
  onTarget: number;
  over: number;
  under: number;
  /** Mean of (calories - goal) over those days; positive means above goal. */
  averageDifference: number | null;
}

export interface DayExtreme {
  day: string;
  calories: number;
}

/** Per-day macro goals in the window's order, null where a day has none. */
export type MacroGoalSeries = Record<
  'protein' | 'carbs' | 'fat',
  (number | null)[]
>;

export interface MacroGoalProgress {
  key: 'protein' | 'carbs' | 'fat';
  /** Mean grams over logged days. */
  average: number;
  /** Mean goal over the logged days that had one. */
  goal: number;
  /** average / goal as a whole percent. */
  pct: number;
}

export interface LoggingStreaks {
  /** Run of logged days ending the window; a still-empty final day does not break it. */
  current: number;
  longest: number;
}

export interface NutritionInsights {
  loggedDays: number;
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
  /** Share of macro calories (4/4/9 kcal per gram), so it sums to 100 whatever else was logged. */
  macroSplit: MacroSplit | null;
  /** Averages over logged days of the previous window, same length; null when it had none. */
  previousAverageCalories: number | null;
  goal: GoalAdherence;
  highest: DayExtreme | null;
  lowest: DayExtreme | null;
  extras: { key: ExtraNutrientKey; average: number }[];
  /** Mean calories per weekday (0 = Sunday), only weekdays with a logged day. */
  weekdayCalories: { weekday: number; average: number }[];
  streaks: LoggingStreaks;
  /** Protein, carbs and fat against their goals; empty when no day had a goal. */
  macroGoals: MacroGoalProgress[];
}

const numeric = (point: NutritionTrendPoint, key: string): number => {
  const raw = point[key];
  const value = typeof raw === 'number' ? raw : parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
};

const loggedPoints = (points: NutritionTrendPoint[]) =>
  points.filter((point) => numeric(point, 'calories') > 0);

const meanOf = (points: NutritionTrendPoint[], key: string): number =>
  average(points.map((point) => numeric(point, key))) ?? 0;

/**
 * Everything the Nutrition report shows beyond the chart. Days with nothing logged are
 * left out of every average (a skipped log is not a fast), so `goals` is indexed by the
 * position of each point in `current`.
 */
export function buildNutritionInsights(
  current: NutritionTrendPoint[],
  previous: NutritionTrendPoint[],
  goals: (number | null)[],
  macroGoalSeries?: MacroGoalSeries
): NutritionInsights {
  const logged = loggedPoints(current);
  const previousLogged = loggedPoints(previous);

  const averages =
    logged.length === 0
      ? null
      : {
          calories: meanOf(logged, 'calories'),
          protein: meanOf(logged, 'protein'),
          carbs: meanOf(logged, 'carbs'),
          fat: meanOf(logged, 'fat'),
        };

  let macroSplit: MacroSplit | null = null;
  if (averages) {
    const protein = averages.protein * 4;
    const carbs = averages.carbs * 4;
    const fat = averages.fat * 9;
    const total = protein + carbs + fat;
    if (total > 0) {
      macroSplit = {
        proteinPct: (protein / total) * 100,
        carbsPct: (carbs / total) * 100,
        fatPct: (fat / total) * 100,
      };
    }
  }

  const goal: GoalAdherence = {
    daysWithGoal: 0,
    onTarget: 0,
    over: 0,
    under: 0,
    averageDifference: null,
  };
  const differences: number[] = [];
  current.forEach((point, index) => {
    const calories = numeric(point, 'calories');
    const target = goals[index];
    if (calories <= 0 || target == null || target <= 0) return;
    goal.daysWithGoal += 1;
    differences.push(calories - target);
    if (calories > target * (1 + GOAL_TOLERANCE)) goal.over += 1;
    else if (calories < target * (1 - GOAL_TOLERANCE)) goal.under += 1;
    else goal.onTarget += 1;
  });
  goal.averageDifference = average(differences);

  const byCalories = [...logged].sort(
    (a, b) => numeric(a, 'calories') - numeric(b, 'calories')
  );
  const toExtreme = (point?: NutritionTrendPoint): DayExtreme | null =>
    point ? { day: point.date, calories: numeric(point, 'calories') } : null;

  return {
    loggedDays: logged.length,
    averages,
    macroSplit,
    previousAverageCalories:
      previousLogged.length === 0 ? null : meanOf(previousLogged, 'calories'),
    goal,
    highest: toExtreme(byCalories[byCalories.length - 1]),
    lowest: logged.length > 1 ? toExtreme(byCalories[0]) : null,
    extras: EXTRA_NUTRIENT_KEYS.map((key) => ({
      key,
      average: meanOf(logged, key),
    })).filter((extra) => extra.average > 0),
    weekdayCalories: weekdayCalories(logged),
    streaks: loggingStreaks(current),
    macroGoals: macroGoalProgress(current, macroGoalSeries),
  };
}

const weekdayCalories = (logged: NutritionTrendPoint[]) => {
  const buckets = new Map<number, number[]>();
  for (const point of logged) {
    const weekday = weekdayOfDay(point.date);
    const list = buckets.get(weekday) ?? [];
    list.push(numeric(point, 'calories'));
    buckets.set(weekday, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, values]) => ({
      weekday,
      average: average(values) ?? 0,
    }));
};

const loggingStreaks = (current: NutritionTrendPoint[]): LoggingStreaks => {
  const flags = current.map((point) => numeric(point, 'calories') > 0);
  let longest = 0;
  let run = 0;
  for (const logged of flags) {
    run = logged ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today is usually still empty in the morning, so it should not zero the streak.
  let end = flags.length - 1;
  if (end >= 0 && !flags[end]) end -= 1;
  let currentRun = 0;
  for (let i = end; i >= 0 && flags[i]; i -= 1) currentRun += 1;
  return { current: currentRun, longest };
};

const macroGoalProgress = (
  current: NutritionTrendPoint[],
  series?: MacroGoalSeries
): MacroGoalProgress[] => {
  if (!series) return [];
  const result: MacroGoalProgress[] = [];
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const actual: number[] = [];
    const targets: number[] = [];
    current.forEach((point, index) => {
      const target = series[key][index];
      if (numeric(point, 'calories') <= 0 || target == null || target <= 0) {
        return;
      }
      actual.push(numeric(point, key));
      targets.push(target);
    });
    const mean = average(actual);
    const goal = average(targets);
    if (mean === null || goal === null) continue;
    result.push({
      key,
      average: mean,
      goal,
      pct: Math.round((mean / goal) * 100),
    });
  }
  return result;
};

/** The stacked-calories chart's series, one point per day of the window. */
export const toCaloriesSeries = (
  points: NutritionTrendPoint[]
): CaloriesDataPoint[] =>
  points.map((point) => ({
    day: point.date,
    calories: numeric(point, 'calories'),
    protein: numeric(point, 'protein'),
    carbs: numeric(point, 'carbs'),
    fat: numeric(point, 'fat'),
  }));

/** Whole-number change against the previous window, or null when either side is missing. */
export const percentChange = (
  current: number | null,
  previous: number | null
): number | null =>
  current === null || previous === null || previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 100);
