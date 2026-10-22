import type { NutrientGoalType } from '@/constants/nutrients';
import type { ExpandedGoals } from '@/types/goals';
import type { Food } from '@/types/food';
import type { NutritionData } from '@/types/reports';
import type { NutrientGoalOverrideMap } from '@/utils/nutrientUtils';

/** Built-in nutrients the insights card evaluates (custom nutrients are added by name). */
export const INSIGHT_BUILTIN_NUTRIENTS = [
  'dietary_fiber',
  'potassium',
  'calcium',
  'iron',
  'vitamin_a',
  'vitamin_c',
  'sodium',
  'saturated_fat',
  'sugars',
] as const;

export type InsightStatus = 'deficient' | 'low' | 'onTarget' | 'over';

export interface NutrientInsight {
  key: string;
  goalType: NutrientGoalType;
  average: number;
  /** Target the percentage is measured against (goal, or target-range midpoint). */
  target: number;
  /** average / target, as a ratio (1 = exactly on target). */
  ratio: number;
  /** 0..1 contribution to the nutrition score. */
  score: number;
  status: InsightStatus;
}

export interface NutrientInsightsResult {
  insights: NutrientInsight[];
  /** 0..100, or null when no nutrient has both a goal and logged data. */
  nutritionScore: number | null;
  /** Days with logged food that the averages are based on. */
  loggedDays: number;
}

const DEFICIENT_BELOW = 0.5;
const LOW_BELOW = 0.9;
const OVER_ABOVE = 1.1;

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, v) => sum + v, 0) / values.length;

const toNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const dayGoal = (goals: ExpandedGoals | undefined, key: string): number => {
  if (!goals) return 0;
  const custom = goals.custom_nutrients?.[key];
  return toNumber(custom ?? goals[key]);
};

const lowStatus = (ratio: number): InsightStatus =>
  ratio < DEFICIENT_BELOW
    ? 'deficient'
    : ratio < LOW_BELOW
      ? 'low'
      : 'onTarget';

const evaluate = (
  key: string,
  goalType: NutrientGoalType,
  average: number,
  target: number,
  range?: { min: number; max: number }
): NutrientInsight => {
  if (goalType === 'maximum') {
    const ratio = average / target;
    return {
      key,
      goalType,
      average,
      target,
      ratio,
      score: ratio <= 1 ? 1 : Math.max(0, 2 - ratio),
      status: ratio > OVER_ABOVE ? 'over' : 'onTarget',
    };
  }
  if (goalType === 'target' && range) {
    const ratio = average / target;
    if (average > range.max) {
      return {
        key,
        goalType,
        average,
        target,
        ratio,
        score: Math.max(0, 1 - (average - range.max) / range.max),
        status: 'over',
      };
    }
    const belowRatio = average / range.min;
    return {
      key,
      goalType,
      average,
      target,
      ratio,
      score: Math.min(belowRatio, 1),
      status: lowStatus(belowRatio),
    };
  }
  const ratio = average / target;
  return {
    key,
    goalType,
    average,
    target,
    ratio,
    score: Math.min(ratio, 1),
    status: lowStatus(ratio),
  };
};

export interface ComputeInsightsInput {
  nutritionData: NutritionData[];
  goals?: Record<string, ExpandedGoals>;
  goalOverrides?: NutrientGoalOverrideMap;
  /** Default direction for a built-in nutrient when the user set no override. */
  defaultGoalType: (key: string) => NutrientGoalType;
  customNutrientNames?: string[];
}

/**
 * Averages intake over days that have logged food and compares it with the goal
 * in force on those days. Nutrients without a positive goal are skipped, since
 * there is nothing to measure them against.
 */
export const computeNutrientInsights = ({
  nutritionData,
  goals,
  goalOverrides,
  defaultGoalType,
  customNutrientNames = [],
}: ComputeInsightsInput): NutrientInsightsResult => {
  const loggedDays = nutritionData.filter((d) => toNumber(d.calories) > 0);
  const insights: NutrientInsight[] = [];

  for (const key of [...INSIGHT_BUILTIN_NUTRIENTS, ...customNutrientNames]) {
    const target = mean(
      loggedDays.map((d) => dayGoal(goals?.[d.date], key)).filter((g) => g > 0)
    );
    if (target <= 0) continue;

    const average = mean(loggedDays.map((d) => toNumber(d[key])));
    const override = goalOverrides?.[key];
    const goalType = override?.goalType ?? defaultGoalType(key);
    const hasRange =
      goalType === 'target' &&
      override?.targetMin != null &&
      override?.targetMax != null;
    const range = hasRange
      ? { min: override.targetMin as number, max: override.targetMax as number }
      : undefined;
    const effectiveTarget = range ? (range.min + range.max) / 2 : target;

    insights.push(
      evaluate(
        key,
        range ? 'target' : goalType === 'target' ? 'minimum' : goalType,
        average,
        effectiveTarget,
        range
      )
    );
  }

  return {
    insights,
    nutritionScore:
      insights.length === 0
        ? null
        : Math.round(mean(insights.map((i) => i.score)) * 100),
    loggedDays: loggedDays.length,
  };
};

export interface FoodSuggestion {
  food: Food;
  /** Weighted 0..1 measure of how much of the gaps one serving covers. */
  score: number;
  covers: { key: string; amount: number; share: number }[];
}

/**
 * Ranks foods by how much of the user's biggest shortfalls one default serving
 * fills. Only nutrients the user is short of count (minimum-style goals with a
 * status of deficient or low); each is weighted by how far short it is.
 */
export const rankFoodSuggestions = (
  foods: Food[],
  insights: NutrientInsight[],
  limit = 8
): FoodSuggestion[] => {
  const gaps = insights
    .filter(
      (i) =>
        i.goalType !== 'maximum' &&
        (i.status === 'deficient' || i.status === 'low') &&
        i.target > i.average
    )
    .map((i) => ({
      key: i.key,
      missing: i.target - i.average,
      weight: 1 - Math.min(i.ratio, 1),
    }));
  if (gaps.length === 0) return [];

  const totalWeight = gaps.reduce((sum, g) => sum + g.weight, 0);
  const seen = new Set<string>();
  const suggestions: FoodSuggestion[] = [];

  for (const food of foods) {
    if (seen.has(food.id) || !food.default_variant) continue;
    seen.add(food.id);

    const variant = food.default_variant;
    const covers: FoodSuggestion['covers'] = [];
    let weighted = 0;
    for (const gap of gaps) {
      const amount = toNumber(
        gap.key in variant
          ? (variant as unknown as Record<string, unknown>)[gap.key]
          : variant.custom_nutrients?.[gap.key]
      );
      if (amount <= 0) continue;
      const share = Math.min(amount / gap.missing, 1);
      weighted += share * gap.weight;
      covers.push({ key: gap.key, amount, share });
    }
    if (weighted <= 0) continue;
    covers.sort((a, b) => b.share - a.share);
    suggestions.push({ food, score: weighted / totalWeight, covers });
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
};
