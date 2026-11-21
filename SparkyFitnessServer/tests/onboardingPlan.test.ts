import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_MULTIPLIERS,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  bodyFatFromOnboardingRange,
  buildOnboardingGoalTargets,
  calculateBasePlan,
  calculateBmr,
  getDietMacroSplit,
  macroPercentagesOfCalories,
  onboardingWaterGoalMl,
  type OnboardingPlanInput,
} from '@workspace/shared';

const NO_CUSTOM = { carbs: 0, protein: 0, fat: 0 };

// 35-year-old male, 84.5 kg, 180 cm, moderately active.
const baseForm: OnboardingPlanInput = {
  sex: 'male',
  primaryGoal: 'maintain_weight',
  currentWeight: 84.5,
  height: 180,
  birthDate: `${new Date().getFullYear() - 35}-01-01`,
  activityLevel: 'moderate',
};

const expectedTdee = Math.round(
  calculateBmr('Mifflin-St Jeor', 84.5, 180, 35, 'male') *
    (ACTIVITY_MULTIPLIERS['moderate'] ?? 1.2)
);

describe('calculateBasePlan goal handling', () => {
  it('returns null when required inputs are missing', () => {
    expect(
      calculateBasePlan(
        { ...baseForm, currentWeight: '' },
        'balanced',
        NO_CUSTOM
      )
    ).toBeNull();
  });

  it('targets maintenance calories when the goal is to maintain', () => {
    const plan = calculateBasePlan(baseForm, 'balanced', NO_CUSTOM);

    expect(plan).not.toBeNull();
    // Baseline is BMR x activity multiplier, within rounding.
    expect(Math.abs(plan!.tdee - expectedTdee)).toBeLessThanOrEqual(10);
    // Rounded to the nearest 10 for presentation.
    expect(plan!.finalDailyCalories).toBe(Math.round(plan!.tdee / 10) * 10);
  });

  it('applies a deficit for weight loss, matching the cut goal mode', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'lose_weight' },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeLessThan(plan!.tdee);
    // 15%, the same deficit the persisted 'cut' goal mode applies afterwards
    // (allowing for the round-to-nearest-10 presentation step).
    expect(
      Math.abs(plan!.finalDailyCalories - plan!.tdee * 0.85)
    ).toBeLessThanOrEqual(10);
  });

  it('applies a surplus for weight gain rather than a flat +500', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'gain_weight' },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeGreaterThan(plan!.tdee);
    // 10%, matching the persisted 'lean_bulk' goal mode.
    expect(
      Math.abs(plan!.finalDailyCalories - plan!.tdee * 1.1)
    ).toBeLessThanOrEqual(10);
    // The old behaviour was a fixed +500 regardless of body size.
    expect(
      Math.abs(plan!.finalDailyCalories - (plan!.tdee + 500))
    ).toBeGreaterThan(10);
  });

  it('scales the surplus with body size, unlike a flat offset', () => {
    const small = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'gain_weight',
        sex: 'female',
        currentWeight: 50,
        height: 150,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM
    );
    const large = calculateBasePlan(
      { ...baseForm, primaryGoal: 'gain_weight' },
      'balanced',
      NO_CUSTOM
    );

    const smallSurplus = small!.finalDailyCalories - small!.tdee;
    const largeSurplus = large!.finalDailyCalories - large!.tdee;
    expect(smallSurplus).toBeGreaterThan(0);
    expect(largeSurplus).toBeGreaterThan(smallSurplus);
  });

  it('never produces a target below the absolute safety floor', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeGreaterThanOrEqual(1200);
  });

  it('uses the configured custom floor when calculating a small weight-loss plan', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM,
      {
        calorieSafetyFloorMode: 'custom',
        calorieSafetyFloorValue: 1000,
      }
    );

    expect(plan!.finalDailyCalories).toBe(1000);
  });

  it('does not clamp a small weight-loss plan when the floor is disabled', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM,
      {
        calorieSafetyFloorMode: 'disabled',
        calorieSafetyFloorValue: 1200,
      }
    );

    expect(plan!.finalDailyCalories).toBe(990);
  });

  // Regression: onboarding calculates finalDailyCalories with the primary goal
  // adjustment baked in. That target is saved directly to user_goals, and
  // PersonalPlan persists goalMode: 'maintain' with goalModeCalculationMethod: 'manual'.
  // This verifies finalDailyCalories calculates the target adjustment exactly once.
  it('bakes the goal-mode adjustment into finalDailyCalories exactly once', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'lose_weight' },
      'balanced',
      NO_CUSTOM
    );

    // 15% off maintenance, rounded to the nearest 10.
    const expectedOnce = Math.round((plan!.tdee * 0.85) / 10) * 10;
    const compounded = Math.round((plan!.tdee * 0.85 * 0.85) / 10) * 10;

    expect(plan!.finalDailyCalories).toBe(expectedOnce);
    expect(plan!.finalDailyCalories).not.toBe(compounded);
  });
});

describe('onboarding plan helpers', () => {
  it('falls back to the balanced split for an unknown diet', () => {
    expect(getDietMacroSplit('nope')).toEqual(getDietMacroSplit('balanced'));
    expect(getDietMacroSplit('atkins')).toEqual({
      carbs: 10,
      protein: 30,
      fat: 60,
    });
  });

  it('uses the custom split only for the custom diet', () => {
    const custom = { carbs: 10, protein: 50, fat: 40 };
    const balanced = calculateBasePlan(baseForm, 'balanced', custom);
    const own = calculateBasePlan(baseForm, 'custom', custom);
    expect(own!.macros.protein).toBeGreaterThan(balanced!.macros.protein);
  });

  it('maps body-fat buckets to their midpoints', () => {
    expect(bodyFatFromOnboardingRange('Low (<15%)')).toBe(12);
    expect(bodyFatFromOnboardingRange('Very High (>35%)')).toBe(38);
    expect(bodyFatFromOnboardingRange('')).toBeNull();
    expect(bodyFatFromOnboardingRange(undefined)).toBeNull();
  });

  it('suggests 35 ml of water per kg', () => {
    expect(onboardingWaterGoalMl(80)).toBe(2800);
  });

  it('builds goal targets with water and micronutrients', () => {
    const targets = buildOnboardingGoalTargets(
      baseForm,
      'balanced',
      NO_CUSTOM,
      {
        fatBreakdown: FatBreakdownAlgorithm.AHA_GUIDELINES,
        minerals: MineralCalculationAlgorithm.RDA_STANDARD,
        vitamins: VitaminCalculationAlgorithm.RDA_STANDARD,
        sugar: SugarCalculationAlgorithm.WHO_GUIDELINES,
      }
    );
    expect(targets).not.toBeNull();
    expect(targets!.goals.calories).toBe(targets!.plan.finalDailyCalories);
    expect(targets!.goals.water_goal_ml).toBe(onboardingWaterGoalMl(84.5));
    expect(targets!.goals.sodium).toBeGreaterThan(0);
  });

  it('returns no targets without a sex', () => {
    expect(
      buildOnboardingGoalTargets(
        { ...baseForm, sex: '' },
        'balanced',
        NO_CUSTOM,
        {
          fatBreakdown: FatBreakdownAlgorithm.AHA_GUIDELINES,
          minerals: MineralCalculationAlgorithm.RDA_STANDARD,
          vitamins: VitaminCalculationAlgorithm.RDA_STANDARD,
          sugar: SugarCalculationAlgorithm.WHO_GUIDELINES,
        }
      )
    ).toBeNull();
  });

  it('gives macro shares of the calories left after fibre', () => {
    // 2000 kcal, 25 g fibre -> 1950 kcal for macros.
    expect(
      macroPercentagesOfCalories({
        calories: 2000,
        protein: 97.5, // 390 kcal = 20%
        carbs: 219.375, // 877.5 kcal = 45%
        fat: 75.83, // 682.5 kcal = 35%
        dietary_fiber: 25,
      })
    ).toEqual({
      protein_percentage: 20,
      carbs_percentage: 45,
      fat_percentage: 35,
    });
    expect(
      macroPercentagesOfCalories({ calories: 0, protein: 1, carbs: 1, fat: 1 })
    ).toEqual({
      protein_percentage: 0,
      carbs_percentage: 0,
      fat_percentage: 0,
    });
  });
});
