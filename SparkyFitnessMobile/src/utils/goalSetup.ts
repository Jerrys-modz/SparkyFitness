import {
  buildOnboardingGoalTargets,
  macroPercentagesOfCalories,
  type AlgorithmBundle,
  type CalorieSafetyFloor,
  type OnboardingActivityLevel,
  type OnboardingPlanInput,
  type OnboardingPrimaryGoal,
  type OnboardingSex,
} from '@workspace/shared';
import type { DailyGoals } from '../types/goals';
import type { UserPreferences } from '../types/preferences';
import type { OnboardingSubmission } from '../services/api/onboardingApi';

/** The wizard's questions, in order, followed by the plan review. */
export const GOAL_SETUP_STEPS = [
  'sex',
  'goal',
  'weight',
  'height',
  'birthDate',
  'bodyFat',
  'targetWeight',
  'meals',
  'activity',
  'burnedCalories',
  'plan',
] as const;

export type GoalSetupStep = (typeof GOAL_SETUP_STEPS)[number];

/** Number of question steps (the plan review is not counted). */
export const GOAL_SETUP_QUESTION_COUNT = GOAL_SETUP_STEPS.length - 1;

export const MEALS_PER_DAY_OPTIONS = [3, 4, 5, 6] as const;

/** Largest weight the server's NUMERIC(5,2) columns hold. */
export const MAX_WEIGHT_KG = 999.99;
export const MAX_HEIGHT_CM = 300;

export interface GoalSetupAnswers {
  sex: OnboardingSex;
  primaryGoal: OnboardingPrimaryGoal;
  weightKg: number | null;
  heightCm: number | null;
  /** YYYY-MM-DD, or '' when not answered */
  birthDate: string;
  /** One of `ONBOARDING_BODY_FAT_RANGES`' values, or '' */
  bodyFatRange: string;
  targetWeightKg: number | null;
  mealsPerDay: number;
  activityLevel: OnboardingActivityLevel;
  addBurnedCalories: boolean | null;
}

export const EMPTY_GOAL_SETUP_ANSWERS: GoalSetupAnswers = {
  sex: '',
  primaryGoal: '',
  weightKg: null,
  heightCm: null,
  birthDate: '',
  bodyFatRange: '',
  targetWeightKg: null,
  mealsPerDay: 3,
  activityLevel: '',
  addBurnedCalories: null,
};

const isPositiveUpTo = (value: number | null, max: number): boolean =>
  value !== null && Number.isFinite(value) && value > 0 && value <= max;

/** Whether a step has the answer it needs to move on. */
export function isGoalSetupStepAnswered(
  step: GoalSetupStep,
  answers: GoalSetupAnswers
): boolean {
  switch (step) {
    case 'sex':
      return answers.sex !== '';
    case 'goal':
      return answers.primaryGoal !== '';
    case 'weight':
      return isPositiveUpTo(answers.weightKg, MAX_WEIGHT_KG);
    case 'height':
      return isPositiveUpTo(answers.heightCm, MAX_HEIGHT_CM);
    case 'birthDate':
      return answers.birthDate !== '';
    case 'bodyFat':
      return answers.bodyFatRange !== '';
    case 'targetWeight':
      return isPositiveUpTo(answers.targetWeightKg, MAX_WEIGHT_KG);
    case 'meals':
      return answers.mealsPerDay > 0;
    case 'activity':
      return answers.activityLevel !== '';
    case 'burnedCalories':
      return answers.addBurnedCalories !== null;
    case 'plan':
      return true;
  }
}

export function toPlanInput(answers: GoalSetupAnswers): OnboardingPlanInput {
  return {
    sex: answers.sex,
    primaryGoal: answers.primaryGoal,
    currentWeight: answers.weightKg ?? '',
    height: answers.heightCm ?? '',
    birthDate: answers.birthDate,
    activityLevel: answers.activityLevel,
  };
}

/** The answers as the server stores them, or null while any is missing. */
export function toOnboardingSubmission(
  answers: GoalSetupAnswers
): OnboardingSubmission | null {
  if (
    !answers.sex ||
    !answers.primaryGoal ||
    !answers.activityLevel ||
    !answers.birthDate ||
    answers.weightKg === null ||
    answers.heightCm === null ||
    answers.targetWeightKg === null
  ) {
    return null;
  }
  return {
    sex: answers.sex,
    primaryGoal: answers.primaryGoal,
    currentWeight: answers.weightKg,
    height: answers.heightCm,
    birthDate: answers.birthDate,
    ...(answers.bodyFatRange ? { bodyFatRange: answers.bodyFatRange } : {}),
    targetWeight: answers.targetWeightKg,
    mealsPerDay: answers.mealsPerDay || 3,
    activityLevel: answers.activityLevel,
    addBurnedCalories: answers.addBurnedCalories === true,
  };
}

/** The account's calorie safety floor, or the standard one when unset. */
export function safetyFloorFromPreferences(
  preferences: UserPreferences | undefined
): CalorieSafetyFloor | undefined {
  if (!preferences?.calorie_safety_floor_mode) return undefined;
  return {
    calorieSafetyFloorMode: preferences.calorie_safety_floor_mode,
    calorieSafetyFloorValue: preferences.calorie_safety_floor_value ?? 1200,
  };
}

/** The suggested goals for the answers and diet, or null while incomplete. */
export function suggestGoalTargets(
  answers: GoalSetupAnswers,
  dietId: string,
  algorithms: AlgorithmBundle,
  safetyFloor: CalorieSafetyFloor | undefined
) {
  return buildOnboardingGoalTargets(
    toPlanInput(answers),
    dietId,
    // The wizard on the phone offers the preset diets only; the custom split
    // is edited afterwards in Goals.
    { carbs: 0, protein: 0, fat: 0 },
    algorithms,
    safetyFloor
  );
}

type GoalTargets = NonNullable<ReturnType<typeof suggestGoalTargets>>;

/**
 * The goals row to save: the suggested targets over the day's current goals,
 * so targets the wizard does not set (caffeine, steps, custom nutrients,
 * meal shares) are kept.
 */
export function goalsFromTargets(
  current: DailyGoals | undefined,
  targets: GoalTargets['goals']
): DailyGoals {
  const goals: DailyGoals = {
    ...current,
    ...targets,
  };
  return {
    ...goals,
    ...macroPercentagesOfCalories(goals),
    breakfast_percentage: current?.breakfast_percentage ?? 25,
    lunch_percentage: current?.lunch_percentage ?? 25,
    dinner_percentage: current?.dinner_percentage ?? 25,
    snacks_percentage: current?.snacks_percentage ?? 25,
  };
}

/**
 * The preference changes goal setup saves. The goal (lose, maintain, gain) is
 * already in the saved calorie target, so the goal mode is stored as
 * maintain / manual to keep it from being applied twice.
 */
export function goalSetupPreferencesPatch(
  answers: GoalSetupAnswers,
  units: {
    weightUnit?: UserPreferences['default_weight_unit'];
    measurementUnit?: UserPreferences['default_measurement_unit'];
  }
): Partial<UserPreferences> {
  return {
    ...(units.weightUnit ? { default_weight_unit: units.weightUnit } : {}),
    ...(units.measurementUnit
      ? { default_measurement_unit: units.measurementUnit }
      : {}),
    activity_level: answers.activityLevel || 'not_much',
    calorie_goal_adjustment_mode: answers.addBurnedCalories
      ? 'dynamic'
      : 'fixed',
    goal_mode: 'maintain',
    goal_mode_calculation_method: 'manual',
  };
}

/** Parses a typed number, accepting a comma decimal separator. */
export function parseDecimalInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
