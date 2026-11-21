import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  AddedSugarAlgorithm,
} from '@workspace/shared';
import {
  EMPTY_GOAL_SETUP_ANSWERS,
  GOAL_SETUP_STEPS,
  goalSetupPreferencesPatch,
  goalsFromTargets,
  isGoalSetupStepAnswered,
  parseDecimalInput,
  safetyFloorFromPreferences,
  suggestGoalTargets,
  toOnboardingSubmission,
  type GoalSetupAnswers,
} from '../../src/utils/goalSetup';
import type { DailyGoals } from '../../src/types/goals';

const complete: GoalSetupAnswers = {
  sex: 'female',
  primaryGoal: 'lose_weight',
  weightKg: 70,
  heightCm: 165,
  birthDate: '1990-06-15',
  bodyFatRange: 'Medium (15-25%)',
  targetWeightKg: 62,
  mealsPerDay: 4,
  activityLevel: 'light',
  addBurnedCalories: true,
};

const algorithms = {
  fatBreakdown: FatBreakdownAlgorithm.AHA_GUIDELINES,
  minerals: MineralCalculationAlgorithm.RDA_STANDARD,
  vitamins: VitaminCalculationAlgorithm.RDA_STANDARD,
  sugar: SugarCalculationAlgorithm.WHO_GUIDELINES,
  addedSugar: AddedSugarAlgorithm.WHO_MAXIMUM,
};

describe('goal setup steps', () => {
  it('ends with the plan review', () => {
    expect(GOAL_SETUP_STEPS[GOAL_SETUP_STEPS.length - 1]).toBe('plan');
  });

  it('requires an answer on every question step', () => {
    for (const step of GOAL_SETUP_STEPS) {
      if (step === 'plan' || step === 'meals') continue;
      expect(isGoalSetupStepAnswered(step, EMPTY_GOAL_SETUP_ANSWERS)).toBe(
        false
      );
      expect(isGoalSetupStepAnswered(step, complete)).toBe(true);
    }
  });

  it('refuses weights out of the stored range', () => {
    expect(
      isGoalSetupStepAnswered('weight', { ...complete, weightKg: 0 })
    ).toBe(false);
    expect(
      isGoalSetupStepAnswered('weight', { ...complete, weightKg: 1200 })
    ).toBe(false);
    expect(
      isGoalSetupStepAnswered('height', { ...complete, heightCm: 400 })
    ).toBe(false);
  });
});

describe('toOnboardingSubmission', () => {
  it('is null while an answer is missing', () => {
    expect(toOnboardingSubmission({ ...complete, sex: '' })).toBeNull();
    expect(
      toOnboardingSubmission({ ...complete, targetWeightKg: null })
    ).toBeNull();
  });

  it('sends the answers the server requires', () => {
    expect(toOnboardingSubmission(complete)).toEqual({
      sex: 'female',
      primaryGoal: 'lose_weight',
      currentWeight: 70,
      height: 165,
      birthDate: '1990-06-15',
      bodyFatRange: 'Medium (15-25%)',
      targetWeight: 62,
      mealsPerDay: 4,
      activityLevel: 'light',
      addBurnedCalories: true,
    });
  });

  it('leaves out an unanswered body fat', () => {
    expect(
      toOnboardingSubmission({ ...complete, bodyFatRange: '' })
    ).not.toHaveProperty('bodyFatRange');
  });
});

describe('suggestGoalTargets and goalsFromTargets', () => {
  it('suggests a deficit for weight loss', () => {
    const targets = suggestGoalTargets(
      complete,
      'balanced',
      algorithms,
      undefined
    );
    expect(targets).not.toBeNull();
    expect(targets!.plan.finalDailyCalories).toBeLessThan(targets!.plan.tdee);
  });

  it('keeps targets the wizard does not set and fills meal shares', () => {
    const targets = suggestGoalTargets(
      complete,
      'balanced',
      algorithms,
      undefined
    )!;
    const current: DailyGoals = {
      calories: 2500,
      protein: 1,
      carbs: 1,
      fat: 1,
      dietary_fiber: 1,
      caffeine_mg: 300,
      target_steps: 9000,
      breakfast_percentage: 40,
    };
    const goals = goalsFromTargets(current, targets.goals);
    expect(goals.calories).toBe(targets.goals.calories);
    expect(goals.caffeine_mg).toBe(300);
    expect(goals.target_steps).toBe(9000);
    expect(goals.breakfast_percentage).toBe(40);
    expect(goals.lunch_percentage).toBe(25);
    expect(
      (goals.protein_percentage ?? 0) +
        (goals.carbs_percentage ?? 0) +
        (goals.fat_percentage ?? 0)
    ).toBeGreaterThanOrEqual(99);
  });
});

describe('goalSetupPreferencesPatch', () => {
  it('stores the goal as maintain/manual so it is applied once', () => {
    expect(goalSetupPreferencesPatch(complete, {})).toEqual({
      activity_level: 'light',
      calorie_goal_adjustment_mode: 'dynamic',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'manual',
    });
  });

  it('saves only the units the person changed', () => {
    expect(
      goalSetupPreferencesPatch(
        { ...complete, addBurnedCalories: false },
        { weightUnit: 'lbs' }
      )
    ).toMatchObject({
      default_weight_unit: 'lbs',
      calorie_goal_adjustment_mode: 'fixed',
    });
  });
});

describe('helpers', () => {
  it('parses a comma decimal', () => {
    expect(parseDecimalInput('72,5')).toBe(72.5);
    expect(parseDecimalInput(' ')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
  });

  it('reads the safety floor only when set', () => {
    expect(safetyFloorFromPreferences(undefined)).toBeUndefined();
    expect(
      safetyFloorFromPreferences({
        calorie_safety_floor_mode: 'custom',
        calorie_safety_floor_value: 1000,
      })
    ).toEqual({
      calorieSafetyFloorMode: 'custom',
      calorieSafetyFloorValue: 1000,
    });
  });
});
