import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import calorieMaintenancePeriodRepository from '../models/calorieMaintenancePeriodRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/calorieMaintenancePeriodRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const days = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];

const calories = (goals: Record<string, unknown>, day: string): number =>
  (goals[day] as { calories: number }).calories;

describe('refeed days and diet breaks in the daily calorie target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
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
    ).mockResolvedValue({ entry_date: days[0], weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
    vi.mocked(
      calorieMaintenancePeriodRepository.getCalorieMaintenancePeriods
    ).mockResolvedValue([]);
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'dynamic',
      goal_mode: 'weekly',
      goal_mode_calculation_method: 'manual',
      goal_mode_weekly_change_kg: -0.5,
      activity_level: 'not_much',
      timezone: 'UTC',
    });
  });

  it('leaves a range with no period on the weekly loss target', async () => {
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      days[0],
      days[3],
      true
    );
    for (const day of days) expect(calories(goals, day)).toBe(1971);
  });

  it('works the covered days out as Maintain and resumes the deficit after', async () => {
    vi.mocked(
      calorieMaintenancePeriodRepository.getCalorieMaintenancePeriods
    ).mockResolvedValue([
      {
        id: 'p1',
        kind: 'diet_break',
        start_date: days[1],
        end_date: days[2],
        note: null,
      },
    ]);
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      days[0],
      days[3],
      true
    );
    expect(calories(goals, days[0])).toBe(1971);
    expect(calories(goals, days[1])).toBe(2400);
    expect(calories(goals, days[2])).toBe(2400);
    expect(calories(goals, days[3])).toBe(1971);
  });

  it('treats a single refeed day the same way', async () => {
    vi.mocked(
      calorieMaintenancePeriodRepository.getCalorieMaintenancePeriods
    ).mockResolvedValue([
      {
        id: 'p2',
        kind: 'refeed_day',
        start_date: days[2],
        end_date: days[2],
        note: 'Long run',
      },
    ]);
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      days[0],
      days[3],
      true
    );
    expect(calories(goals, days[1])).toBe(1971);
    expect(calories(goals, days[2])).toBe(2400);
  });

  it('does not look the periods up when targets are not being adjusted', async () => {
    await goalService.getUserGoalsForRange('user-1', days[0], days[3], false);
    expect(
      calorieMaintenancePeriodRepository.getCalorieMaintenancePeriods
    ).not.toHaveBeenCalled();
  });
});
