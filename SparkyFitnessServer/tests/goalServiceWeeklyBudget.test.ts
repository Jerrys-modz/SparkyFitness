import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { getAdaptiveActivityCalories } from '../services/adaptiveActivityService.js';
import { getDailyNutritionTotalsRange } from '../models/reportRepository.js';
import {
  CALORIE_RULE_DEFAULTS,
  trainingRestOffsets,
  type WeeklyCalorieBudgetDay,
} from '@workspace/shared';
import type { CalorieRuleHistoryRow } from '../models/calorieRuleHistoryRepository.js';

// No diet phases: the calorie maths is exactly as without the feature.
vi.mock('../services/dietPhaseService.js', () => ({
  loadDietPhasesForCalories: vi.fn(async () => []),
}));
vi.mock('../models/goalRepository.js');
vi.mock('../models/calorieMaintenancePeriodRepository.js', () => ({
  default: { getCalorieMaintenancePeriods: vi.fn().mockResolvedValue([]) },
  getCalorieMaintenancePeriods: vi.fn().mockResolvedValue([]),
}));
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../models/exerciseEntry.js');
vi.mock('../models/genericHealthRepository.js', () => ({
  getDeviceTotalCaloriesByDateRange: vi.fn().mockResolvedValue([]),
}));
vi.mock('../models/reportRepository.js', () => ({
  getDailyNutritionTotalsRange: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');
vi.mock('../services/adaptiveActivityService.js');

// 2026-11-16 is a Monday.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const SUN = '2026-11-22';

const baseGoal = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 400 / 9,
  protein_percentage: 30,
  carbs_percentage: 50,
  fat_percentage: 20,
  dietary_fiber: 0,
};
const basePreferences = {
  calorie_goal_adjustment_mode: 'fixed',
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  activity_level: 'not_much',
  calorie_safety_floor_mode: 'custom',
  calorie_safety_floor_value: 1200,
  calorie_cycling_mode: 'off',
  calorie_cycling_offsets: [0, 0, 0, 0, 0, 0, 0],
  weekly_calorie_budget_enabled: true,
  weekly_calorie_budget_max_shift_percent: 20,
  first_day_of_week: 1,
  timezone: 'UTC',
};

type DayGoals = {
  calories: number;
  carbs: number;
  protein: number;
  weekly_calorie_budget?: WeeklyCalorieBudgetDay;
};

const usePreferences = (overrides: Record<string, unknown> = {}) =>
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
    ...basePreferences,
    ...overrides,
  });
const useEaten = (eaten: Record<string, number>) =>
  vi.mocked(getDailyNutritionTotalsRange).mockResolvedValue(
    Object.entries(eaten).map(([entry_date, calories]) => ({
      entry_date,
      calories,
    }))
  );
const goalsFor = (start: string, end: string) =>
  goalService.getUserGoalsForRange('user-1', start, end, true) as Promise<
    Record<string, DayGoals>
  >;

describe('weekly calorie budget in the daily goal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Thursday morning in UTC.
    vi.setSystemTime(new Date('2026-11-19T08:00:00Z'));
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([]);
    vi.mocked(
      genericHealthRepository.getDeviceTotalCaloriesByDateRange
    ).mockResolvedValue([]);
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    usePreferences();
    useEaten({});
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: MON, weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves today by the earlier days of the week, read from before the range', async () => {
    useEaten({ [MON]: 1700, [TUE]: 1700, [WED]: 2000 });
    const goals = await goalsFor(THU, THU);

    // Only the requested day comes back, but its week was read from Monday.
    expect(Object.keys(goals)).toEqual([THU]);
    expect(getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-11-13',
      THU
    );
    // 600 under over the 4 days Thursday to Sunday.
    expect(goals[THU].calories).toBe(2150);
    expect(goals[THU].weekly_calorie_budget).toMatchObject({
      baseTarget: 2000,
      target: 2150,
      shift: 150,
      daysLeft: 4,
      countedDays: 3,
      weekStart: MON,
      weekEnd: SUN,
    });
    // Carbs take the change; protein stays.
    expect(goals[THU].protein).toBeCloseTo(150);
    expect(goals[THU].carbs).toBeCloseTo(250 + 150 / 4);
  });

  it('leaves goals alone when the budget is off', async () => {
    usePreferences({ weekly_calorie_budget_enabled: false });
    useEaten({ [MON]: 4000 });
    const goals = await goalsFor(THU, THU);
    expect(goals[THU].calories).toBe(2000);
    expect(goals[THU].weekly_calorie_budget).toBeUndefined();
    expect(getDailyNutritionTotalsRange).not.toHaveBeenCalled();
  });

  it('starts from the day it was switched on midweek', async () => {
    const off = { ...CALORIE_RULE_DEFAULTS, ...basePreferences } as const;
    const history: CalorieRuleHistoryRow[] = [
      {
        ...off,
        weekly_calorie_budget_enabled: false,
        effective_date: '-infinity',
      } as CalorieRuleHistoryRow,
      { ...off, effective_date: WED } as CalorieRuleHistoryRow,
    ];
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue(history);
    // Monday and Tuesday were big days, before the budget existed.
    useEaten({ [MON]: 3500, [TUE]: 3500, [WED]: 1600 });

    const goals = await goalsFor(MON, THU);
    expect(goals[MON].weekly_calorie_budget).toBeUndefined();
    expect(goals[TUE].calories).toBe(2000);
    expect(goals[WED].weekly_calorie_budget).toMatchObject({
      target: 2000,
      countedDays: 0,
    });
    // Only Wednesday counts: 400 under over 4 days.
    expect(goals[THU].calories).toBe(2100);
  });

  it('caps the change and respects the safety floor', async () => {
    usePreferences({ calorie_safety_floor_value: 1700 });
    useEaten({ [MON]: 5000, [TUE]: 4000, [WED]: 4000 });
    const goals = await goalsFor(THU, THU);
    // -1750 a day uncapped, -400 capped, then held at the 1700 floor.
    expect(goals[THU].weekly_calorie_budget).toMatchObject({
      limitedBy: 'floor',
      target: 1700,
    });
    expect(goals[THU].calories).toBe(1700);
  });

  it('counts credited exercise once, on its own day', async () => {
    usePreferences({ calorie_goal_adjustment_mode: 'dynamic' });
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(
      new Map([[WED, 500]])
    );
    // Wednesday ate its workout back; that is on target, not over.
    useEaten({ [WED]: 2500 });
    const goals = await goalsFor(THU, THU);
    expect(goals[THU].weekly_calorie_budget).toMatchObject({
      allowanceSoFar: 2500,
      eatenSoFar: 2500,
      carryover: 0,
    });
    expect(goals[THU].calories).toBe(2000);
  });

  it('keeps the calorie cycling pattern and spreads the carryover evenly', async () => {
    const offsets = trainingRestOffsets([1, 3, 5], 15);
    usePreferences({
      calorie_cycling_mode: 'training_rest',
      calorie_cycling_offsets: offsets,
    });
    useEaten({ [MON]: 2000, [TUE]: 1500, [WED]: 2000 });
    const withBudget = await goalsFor(THU, THU);

    usePreferences({
      calorie_cycling_mode: 'training_rest',
      calorie_cycling_offsets: offsets,
      weekly_calorie_budget_enabled: false,
    });
    const cycledOnly = await goalsFor(THU, THU);
    const budget = withBudget[THU].weekly_calorie_budget;
    // The budget starts from the cycled day and adds its share on top.
    expect(budget?.baseTarget).toBe(cycledOnly[THU].calories);
    expect(withBudget[THU].calories).toBe(
      cycledOnly[THU].calories + (budget?.shift ?? 0)
    );
  });

  it('does not count today while it is still open', async () => {
    useEaten({ [MON]: 2000, [TUE]: 2000, [WED]: 2000, [THU]: 200 });
    const goals = await goalsFor(THU, SUN);
    // Thursday's 200 kcal so far does not raise Friday to Sunday.
    expect(goals['2026-11-20'].calories).toBe(2000);
    expect(goals[SUN].weekly_calorie_budget?.countedDays).toBe(3);
  });
});
