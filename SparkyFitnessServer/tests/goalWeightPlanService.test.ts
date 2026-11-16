import { beforeEach, describe, expect, it, vi } from 'vitest';
import onboardingRepository from '../models/onboardingRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import { getCalorieTargetReview } from '../services/calorieTargetReviewService.js';
import { getGoalWeightPlan } from '../services/goalWeightPlanService.js';

vi.mock('../models/onboardingRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../services/calorieTargetReviewService.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('@workspace/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@workspace/shared')>();
  return { ...actual, todayInZone: () => '2027-01-01' };
});

const mocked = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

describe('getGoalWeightPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      goal_mode: 'cut',
      goal_mode_weekly_change_kg: 0,
    });
    mocked(userRepository.getUserProfile).mockResolvedValue({
      gender: 'female',
    });
    mocked(reportRepository.getBodyWeightReadings).mockResolvedValue([
      { date: '2026-12-25', weightKg: 80 },
      { date: '2027-01-01', weightKg: 80 },
    ]);
    mocked(getCalorieTargetReview).mockResolvedValue({
      maintenanceKcal: 2400,
      impliedKgPerWeek: -0.6,
    });
  });

  it('returns no plan without a goal weight', async () => {
    mocked(onboardingRepository.getGoalWeight).mockResolvedValue({
      targetWeightKg: null,
      targetDate: null,
      setOn: null,
    });
    const result = await getGoalWeightPlan('u1');
    expect(result.plan).toBeNull();
    expect(reportRepository.getBodyWeightReadings).not.toHaveBeenCalled();
  });

  it('returns the trend but no plan without a target date', async () => {
    mocked(onboardingRepository.getGoalWeight).mockResolvedValue({
      targetWeightKg: 75,
      targetDate: null,
      setOn: '2026-12-25',
    });
    const result = await getGoalWeightPlan('u1');
    expect(result.currentKg).toBe(80);
    expect(result.plan).toBeNull();
    expect(getCalorieTargetReview).not.toHaveBeenCalled();
  });

  it('compares the date with the calorie goal pace (Cut)', async () => {
    mocked(onboardingRepository.getGoalWeight).mockResolvedValue({
      targetWeightKg: 78,
      targetDate: '2027-01-29',
      setOn: '2026-12-25',
    });
    const result = await getGoalWeightPlan('u1');
    expect(result.goalMode).toBe('cut');
    expect(result.plan?.requiredKgPerWeek).toBe(-0.5);
    expect(result.plan?.settingKgPerWeek).toBe(-0.6);
    expect(result.plan?.status).toBe('on_course');
    expect(result.plan?.suggestedCalories).toBe(1970);
    expect(result.plan?.schedule).not.toBeNull();
  });
});
