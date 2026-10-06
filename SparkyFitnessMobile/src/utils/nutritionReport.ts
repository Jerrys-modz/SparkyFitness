import type { NutritionTrendPoint } from '../services/api/reportsApi';
import type { CaloriesDataPoint } from '../types/healthTrends';
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
  goals: (number | null)[]
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
  };
}

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
