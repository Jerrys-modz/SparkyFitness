import { describe, expect, it } from 'vitest';
import {
  buildGoalWeightPlan,
  weeklyChangeSafetyZone,
  type GoalWeightPlanInput,
} from '@workspace/shared';

// 28 days to lose 2 kg: 0.5 kg a week, about 430 kcal a day at 6000 kcal/kg.
const base: GoalWeightPlanInput = {
  today: '2027-01-01',
  targetDate: '2027-01-29',
  goalKg: 78,
  currentKg: 80,
  settingKgPerWeek: -0.5,
  maintenanceKcal: 2500,
  floorKcal: 1500,
};

describe('buildGoalWeightPlan', () => {
  it('works out the pace and calories the date needs', () => {
    const plan = buildGoalWeightPlan(base);
    expect(plan.status).toBe('on_course');
    expect(plan.daysLeft).toBe(28);
    expect(plan.remainingKg).toBe(-2);
    expect(plan.requiredKgPerWeek).toBe(-0.5);
    expect(plan.requiredDailyKcal).toBe(-429);
    expect(plan.suggestedCalories).toBe(2070);
    expect(plan.requiredPercentPerWeek).toBe(0.63);
    expect(plan.safetyZone).toBe('green');
    expect(plan.belowFloor).toBe(false);
    expect(plan.settingReachDate).toBe('2027-01-29');
  });

  it('asks for a faster pace when the setting falls short (e.g. a gentle Cut)', () => {
    const plan = buildGoalWeightPlan({ ...base, settingKgPerWeek: -0.3 });
    expect(plan.status).toBe('needs_faster');
    expect(plan.settingReachDate).toBe('2027-02-17');
  });

  it('offers a gentler pace when the setting is much faster than needed', () => {
    const plan = buildGoalWeightPlan({ ...base, settingKgPerWeek: -0.9 });
    expect(plan.status).toBe('needs_slower');
  });

  it('flags a setting that maintains or gains for a loss goal', () => {
    expect(buildGoalWeightPlan({ ...base, settingKgPerWeek: 0 }).status).toBe(
      'wrong_direction'
    );
    expect(
      buildGoalWeightPlan({ ...base, settingKgPerWeek: 0.25 }).status
    ).toBe('wrong_direction');
  });

  it('reports no setting without a calorie goal pace', () => {
    const plan = buildGoalWeightPlan({ ...base, settingKgPerWeek: null });
    expect(plan.status).toBe('no_setting');
    expect(plan.requiredKgPerWeek).toBe(-0.5);
  });

  it('warns with the calorie settings thresholds and never blocks', () => {
    // 4 kg in 14 days: 2 kg a week, 2.5% of 80 kg.
    const plan = buildGoalWeightPlan({
      ...base,
      goalKg: 76,
      targetDate: '2027-01-15',
    });
    expect(plan.safetyZone).toBe('red');
    expect(plan.requiredKgPerWeek).toBe(-2);
    expect(plan.status).toBe('needs_faster');
  });

  it('shows the earliest date the floor allows when the date needs too few calories', () => {
    // -2 kg/week needs -1714 kcal: 790 < 1500. At the floor: -1000 kcal = -1.17 kg/week.
    const plan = buildGoalWeightPlan({
      ...base,
      goalKg: 76,
      targetDate: '2027-01-15',
    });
    expect(plan.belowFloor).toBe(true);
    expect(plan.earliestDate).toBe('2027-01-25');
    expect(plan.floorKcal).toBe(1500);
    expect(plan.floorEnforced).toBe(true);
    expect(plan.fastestKgPerWeek).toBe(-1.17);
  });

  it('keeps the warning but marks the floor as not enforced when it is turned off', () => {
    const plan = buildGoalWeightPlan({
      ...base,
      goalKg: 76,
      targetDate: '2027-01-15',
      floorEnforced: false,
    });
    expect(plan.belowFloor).toBe(true);
    expect(plan.floorEnforced).toBe(false);
  });

  it('has no fastest pace when the pace is above the floor', () => {
    const plan = buildGoalWeightPlan(base);
    expect(plan.fastestKgPerWeek).toBeNull();
    expect(plan.floorEnforced).toBe(true);
  });

  it('offers High cut when its pace is close to the required pace', () => {
    // High cut at 2500 kcal: -500 kcal = -0.58 kg/week.
    const plan = buildGoalWeightPlan({
      ...base,
      goalKg: 77.7,
      targetDate: '2027-01-29',
    });
    expect(plan.requiredKgPerWeek).toBe(-0.57);
    expect(plan.highCutKgPerWeek).toBe(-0.58);
    expect(buildGoalWeightPlan(base).highCutKgPerWeek).toBeNull();
  });

  it('uses the tighter gain thresholds for a gain goal', () => {
    const plan = buildGoalWeightPlan({
      ...base,
      // 1 kg in 4 weeks: 0.25 kg a week, 0.31% of 80 kg.
      goalKg: 81,
      settingKgPerWeek: 0.25,
    });
    expect(plan.requiredKgPerWeek).toBe(0.25);
    expect(plan.safetyZone).toBe('yellow');
    expect(plan.belowFloor).toBe(false);
    expect(plan.highCutKgPerWeek).toBeNull();
    expect(plan.status).toBe('on_course');
  });

  it('says the date passed without moving it', () => {
    const plan = buildGoalWeightPlan({ ...base, today: '2027-02-01' });
    expect(plan.status).toBe('date_passed');
    expect(plan.daysLeft).toBe(-3);
    expect(plan.requiredKgPerWeek).toBeNull();
  });

  it('counts the goal reached once the trend gets there or past it', () => {
    expect(buildGoalWeightPlan({ ...base, currentKg: 78.1 }).status).toBe(
      'reached'
    );
    expect(
      buildGoalWeightPlan({ ...base, currentKg: 77, startKg: 80 }).status
    ).toBe('reached');
  });

  it('says how far ahead or behind the planned path the trend is', () => {
    // Set on 2026-12-18 at 81 kg; 42 days to lose 3 kg (0.0714 kg a day).
    const input = { ...base, startKg: 81, setOn: '2026-12-18' };
    // Planned on 2027-01-01 (14 days in): 80 kg.
    expect(buildGoalWeightPlan(input).schedule).toEqual({
      plannedKg: 80,
      daysAhead: 0,
    });
    expect(buildGoalWeightPlan({ ...input, currentKg: 79.5 }).schedule).toEqual(
      { plannedKg: 80, daysAhead: 7 }
    );
    expect(buildGoalWeightPlan({ ...input, currentKg: 80.5 }).schedule).toEqual(
      { plannedKg: 80, daysAhead: -7 }
    );
    expect(buildGoalWeightPlan(base).schedule).toBeNull();
  });
});

describe('weeklyChangeSafetyZone', () => {
  it('keeps the calorie settings thresholds', () => {
    expect(weeklyChangeSafetyZone(1, false)).toBe('green');
    expect(weeklyChangeSafetyZone(1.2, false)).toBe('yellow');
    expect(weeklyChangeSafetyZone(1.6, false)).toBe('red');
    expect(weeklyChangeSafetyZone(0.25, true)).toBe('green');
    expect(weeklyChangeSafetyZone(0.3, true)).toBe('yellow');
    expect(weeklyChangeSafetyZone(0.6, true)).toBe('red');
  });
});
