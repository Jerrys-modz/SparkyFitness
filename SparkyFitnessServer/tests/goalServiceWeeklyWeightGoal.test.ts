import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';
import { loadDietPhasesForCalories } from '../services/dietPhaseService.js';

// No diet phases: the calorie maths is exactly as without the feature.
vi.mock('../services/dietPhaseService.js', () => ({
  loadDietPhasesForCalories: vi.fn(async () => []),
}));
vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/calorieMaintenancePeriodRepository.js', () => ({
  default: { getCalorieMaintenancePeriods: async () => [] },
}));
vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const date = '2026-10-22';
describe('weekly weight goal daily targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2400,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: date, weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 2600,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 30,
          lastCalculated: date,
        },
      }
    );
  });

  it.each([-0.5, 0, 0.25])(
    'applies %s kg/week to the adaptive baseline',
    async (rate) => {
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        calorie_goal_adjustment_mode: 'dynamic',
        goal_mode: 'weekly',
        goal_mode_calculation_method: 'adaptive',
        goal_mode_weekly_change_kg: rate,
        activity_level: 'not_much',
        timezone: 'UTC',
        calorie_safety_floor_mode: 'standard',
      });
      const goals = await goalService.getUserGoalsForRange(
        'user-1',
        date,
        date,
        true
      );
      expect((goals[date] as { calories: number }).calories).toBe(
        Math.round(2600 + (rate * 6000) / 7)
      );
    }
  );

  it('a diet phase covering the day replaces Goal Mode with its weekly rate', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'dynamic',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'adaptive',
      activity_level: 'not_much',
      timezone: 'UTC',
      calorie_safety_floor_mode: 'standard',
    });
    vi.mocked(loadDietPhasesForCalories).mockResolvedValueOnce([
      {
        id: 'cut',
        phase_type: 'loss',
        weekly_change_kg: 0.5,
        start_date: '2026-10-19',
        end_date: '2026-10-22',
        duration_weeks: null,
        target_weight_kg: null,
        target_reached_on: null,
        label: null,
      },
    ]);
    const next = '2026-10-23';
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      Object.fromEntries(
        [date, next].map((day) => [
          day,
          {
            tdee: 2600,
            confidence: 'HIGH',
            isFallback: false,
            daysOfData: 30,
            lastCalculated: day,
          },
        ])
      )
    );
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      next,
      true
    );
    // Last day of the cut: 0.5 kg/week below the baseline.
    expect((goals[date] as { calories: number }).calories).toBe(
      Math.round(2600 - (0.5 * 6000) / 7)
    );
    // The day after falls back to the person's own Goal Mode (maintain).
    expect((goals[next] as { calories: number }).calories).toBe(2600);
  });

  it.each(['dynamic', 'fixed', 'percentage'])(
    'applies the weekly change once to the manual baseline in %s mode',
    async (adjustmentMode) => {
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        calorie_goal_adjustment_mode: adjustmentMode,
        goal_mode: 'weekly',
        goal_mode_calculation_method: 'manual',
        goal_mode_weekly_change_kg: -0.5,
        activity_level: 'not_much',
        timezone: 'UTC',
      });
      const goals = await goalService.getUserGoalsForRange(
        'user-1',
        date,
        date,
        true
      );
      expect((goals[date] as { calories: number }).calories).toBe(1971);
    }
  );

  it('still applies the configured adaptive floor to an unreachable weekly loss', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'adaptive',
      goal_mode: 'weekly',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_weekly_change_kg: -2,
      calorie_safety_floor_mode: 'custom',
      calorie_safety_floor_value: 1500,
      activity_level: 'not_much',
      timezone: 'UTC',
    });
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      date,
      true
    );
    expect((goals[date] as { calories: number }).calories).toBe(1500);
  });

  it('applies a weekly manual goal without a BMR estimate', async () => {
    vi.mocked(bmrService.calculateBmr).mockReturnValue(0);
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'fixed',
      goal_mode: 'weekly',
      goal_mode_calculation_method: 'manual',
      goal_mode_weekly_change_kg: -0.5,
      bmr_algorithm: 'Katch-McArdle',
      timezone: 'UTC',
    });
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      date,
      true
    );
    expect((goals[date] as { calories: number }).calories).toBe(1971);
  });
});
