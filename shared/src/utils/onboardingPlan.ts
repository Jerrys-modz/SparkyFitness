/**
 * The goal-setup wizard's plan maths, shared by the web onboarding and the
 * mobile Goal Setup screen so both suggest the same targets.
 *
 * Inputs are metric (kg, cm) and energy is kcal; each app converts units at
 * its own edges. Ids only here: labels and descriptions live in each app.
 */
import {
  ACTIVITY_MULTIPLIERS,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  type CalorieSafetyFloorMode,
} from '../constants/calorieConstants.ts';
import {
  AddedSugarAlgorithm,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
} from '../nutrients/nutrientAlgorithms.ts';
import { calculateAllAdvancedNutrients } from '../nutrients/nutrientCalculation.ts';
import {
  calculateBmr,
  computeCalorieTarget,
  goalModeFromPrimaryGoal,
} from './calorieCalculations.ts';
import { calculateAge } from './timezone.ts';

export type OnboardingSex = 'male' | 'female' | '';
export type OnboardingPrimaryGoal =
  'lose_weight' | 'maintain_weight' | 'gain_weight' | '';
export type OnboardingActivityLevel =
  'not_much' | 'light' | 'moderate' | 'heavy' | '';

/** The answers the plan is calculated from; weight in kg, height in cm. */
export interface OnboardingPlanInput {
  sex: OnboardingSex;
  primaryGoal: OnboardingPrimaryGoal;
  currentWeight: number | '';
  height: number | '';
  /** YYYY-MM-DD */
  birthDate: string;
  activityLevel: OnboardingActivityLevel;
}

export interface OnboardingBasePlan {
  bmr: number;
  tdee: number;
  /** kcal, rounded to the nearest 10 */
  finalDailyCalories: number;
  /** grams */
  macros: {
    carbs: number;
    protein: number;
    fat: number;
    fiber: number;
  };
}

export interface MacroSplit {
  carbs: number;
  protein: number;
  fat: number;
}

export interface CalorieSafetyFloor {
  calorieSafetyFloorMode: CalorieSafetyFloorMode;
  calorieSafetyFloorValue: number;
}

/** Macro splits (percent of calories) offered by the wizard, by diet id. */
export const DIET_MACRO_SPLITS = [
  { id: 'balanced', carbs: 45, protein: 20, fat: 35 },
  { id: 'mediterranean', carbs: 50, protein: 15, fat: 35 },
  { id: 'dash', carbs: 55, protein: 18, fat: 27 },
  { id: 'atkins', carbs: 10, protein: 30, fat: 60 },
  { id: 'low_fat', carbs: 70, protein: 20, fat: 10 },
  { id: 'low_carb', carbs: 5, protein: 20, fat: 75 },
  { id: 'custom', carbs: 40, protein: 30, fat: 30 },
] as const;

export type DietId = (typeof DIET_MACRO_SPLITS)[number]['id'];

export const DEFAULT_DIET_ID: DietId = 'balanced';

/** The split for a diet id; an unknown id gets the balanced split. */
export function getDietMacroSplit(id: string): MacroSplit {
  const found =
    DIET_MACRO_SPLITS.find((d) => d.id === id) ?? DIET_MACRO_SPLITS[0];
  return { carbs: found.carbs, protein: found.protein, fat: found.fat };
}

/**
 * The body-fat buckets the wizard offers, with the midpoint saved as the
 * check-in body fat %. The value strings are what the web has always stored
 * in `onboarding_data.body_fat_range`, so they stay as they are.
 */
export const ONBOARDING_BODY_FAT_RANGES = [
  { value: 'Low (<15%)', key: 'low', midpoint: 12 },
  { value: 'Medium (15-25%)', key: 'medium', midpoint: 20 },
  { value: 'High (25-35%)', key: 'high', midpoint: 30 },
  { value: 'Very High (>35%)', key: 'veryHigh', midpoint: 38 },
] as const;

export type OnboardingBodyFatRange =
  (typeof ONBOARDING_BODY_FAT_RANGES)[number]['value'];

/**
 * Midpoint of a body-fat bucket, or null when unanswered. Rough, but it lets
 * the lean-mass BMR formulas (Katch-McArdle, Cunningham) work at all.
 */
export function bodyFatFromOnboardingRange(
  range: string | undefined | null
): number | null {
  return (
    ONBOARDING_BODY_FAT_RANGES.find((r) => r.value === range)?.midpoint ?? null
  );
}

/** Starting water goal: 35 ml per kg of body weight. */
export function onboardingWaterGoalMl(weightKg: number): number {
  return Math.round(weightKg * 35);
}

/**
 * The starting calorie target and macro grams. The goal (lose, maintain,
 * gain) is applied here once, through the same engine as Calculation
 * Settings, so the saved goal must be stored with goal mode `maintain` /
 * method `manual` to avoid adjusting it a second time.
 */
export function calculateBasePlan(
  input: OnboardingPlanInput,
  dietId: string,
  customSplit: MacroSplit,
  safetyFloor: CalorieSafetyFloor = {
    calorieSafetyFloorMode: 'standard',
    calorieSafetyFloorValue: DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  }
): OnboardingBasePlan | null {
  const weightKg = Number(input.currentWeight) || 0;
  const heightCm = Number(input.height) || 0;
  // Year subtraction is a year off until the birthday passes; calculateAge
  // accounts for the month and day.
  const age = input.birthDate ? calculateAge(input.birthDate) : 30;

  if (
    isNaN(weightKg) ||
    isNaN(heightCm) ||
    isNaN(age) ||
    !input.activityLevel ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }

  const gender = input.sex === 'male' ? 'male' : 'female';
  const bmr = calculateBmr('Mifflin-St Jeor', weightKg, heightCm, age, gender);

  // Presented as adaptive-with-no-history, so the baseline is BMR x activity
  // multiplier and the safety floors apply, as Calculation Settings shows later.
  const targetResult = computeCalorieTarget({
    goalMode: goalModeFromPrimaryGoal(input.primaryGoal),
    calculationMethod: 'adaptive',
    customPercentage: 0,
    bmr,
    activityLevelMultiplier: ACTIVITY_MULTIPLIERS[input.activityLevel] ?? 1.2,
    adaptiveTdee: null,
    adaptiveTdeeFallback: true,
    adaptiveTdeeDaysOfData: 0,
    weightKg,
    heightCm,
    age,
    gender,
    currentGoalCalories: 0,
    calculateBmrFn: calculateBmr,
    calorieSafetyFloorMode: safetyFloor.calorieSafetyFloorMode,
    calorieSafetyFloorValue: safetyFloor.calorieSafetyFloorValue,
  });

  const finalDailyCalories = Math.round(targetResult.finalTarget / 10) * 10;
  const split = dietId === 'custom' ? customSplit : getDietMacroSplit(dietId);

  const fiberGrams = Math.round((finalDailyCalories / 1000) * 14);
  const adjustedCalories = Math.max(0, finalDailyCalories - fiberGrams * 2);

  return {
    bmr,
    tdee: targetResult.baselineTdee,
    finalDailyCalories,
    macros: {
      carbs: Math.round((adjustedCalories * (split.carbs / 100)) / 4),
      protein: Math.round((adjustedCalories * (split.protein / 100)) / 4),
      fat: Math.round((adjustedCalories * (split.fat / 100)) / 9),
      fiber: fiberGrams,
    },
  };
}

export interface OnboardingNutrientAlgorithms {
  fatBreakdown: FatBreakdownAlgorithm;
  minerals: MineralCalculationAlgorithm;
  vitamins: VitaminCalculationAlgorithm;
  sugar: SugarCalculationAlgorithm;
}

/**
 * The goal values the wizard starts from (kcal, grams, mg, ml): the base plan
 * plus water and the fat breakdown, mineral, vitamin and sugar targets.
 * Null when the answers are not enough for a plan.
 */
export function buildOnboardingGoalTargets(
  input: OnboardingPlanInput,
  dietId: string,
  customSplit: MacroSplit,
  algorithms: OnboardingNutrientAlgorithms,
  safetyFloor?: CalorieSafetyFloor
) {
  const plan = calculateBasePlan(input, dietId, customSplit, safetyFloor);
  if (!plan || !input.sex || !input.activityLevel) return null;

  const weightKg = Number(input.currentWeight) || 0;
  const advanced = calculateAllAdvancedNutrients(
    {
      age: input.birthDate ? calculateAge(input.birthDate) : 30,
      sex: input.sex,
      weightKg,
      calories: plan.finalDailyCalories,
      totalFatGrams: plan.macros.fat,
      activityLevel: input.activityLevel,
    },
    {
      fatBreakdown: algorithms.fatBreakdown,
      minerals: algorithms.minerals,
      vitamins: algorithms.vitamins,
      sugar: algorithms.sugar,
      // The wizard has no Added Sugars preference; this field is only needed
      // for the bundle's shape and is not read here.
      addedSugar: AddedSugarAlgorithm.WHO_IDEAL,
    }
  );

  return {
    plan,
    goals: {
      calories: plan.finalDailyCalories,
      protein: plan.macros.protein,
      carbs: plan.macros.carbs,
      fat: plan.macros.fat,
      dietary_fiber: plan.macros.fiber,
      water_goal_ml: onboardingWaterGoalMl(weightKg),
      ...advanced,
    },
  };
}

/**
 * Whole-percent macro shares of a calorie goal, as the goal is saved: the
 * calories fibre accounts for (2 kcal/g) are left out first.
 */
export function macroPercentagesOfCalories(goal: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number | null;
}): {
  protein_percentage: number;
  carbs_percentage: number;
  fat_percentage: number;
} {
  const macroCalories = Math.max(
    0,
    goal.calories - (goal.dietary_fiber || 0) * 2
  );
  const share = (kcal: number) =>
    macroCalories > 0 ? Math.round((kcal / macroCalories) * 100) : 0;
  return {
    protein_percentage: share(goal.protein * 4),
    carbs_percentage: share(goal.carbs * 4),
    fat_percentage: share(goal.fat * 9),
  };
}
