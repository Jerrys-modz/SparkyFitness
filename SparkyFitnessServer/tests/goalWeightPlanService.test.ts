import { beforeEach, describe, expect, it, vi } from 'vitest';
import onboardingRepository from '../models/onboardingRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import reportRepository from '../models/reportRepository.js';
import { getCalorieTargetReview } from '../services/calorieTargetReviewService.js';
import { getEffectiveCalorieSafetyFloor } from '../services/calorieSafetyFloorService.js';
import { getGoalWeightPlan } from '../services/goalWeightPlanService.js';

vi.mock('../models/onboardingRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../services/calorieTargetReviewService.js');
vi.mock('../services/calorieSafetyFloorService.js');
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
    mocked(getEffectiveCalorieSafetyFloor).mockResolvedValue({
      enforcedKcal: 1200,
      standardKcal: 1200,
      mode: 'standard',
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

  describe('safety floor', () => {
    // 80 kg to 70 kg in 10 weeks needs -1 kg a week, about 857 kcal a day
    // under a 2,400 kcal maintenance: 1,540 kcal a day.
    const dated = () =>
      mocked(onboardingRepository.getGoalWeight).mockResolvedValue({
        targetWeightKg: 70,
        targetDate: '2027-03-12',
        setOn: '2026-12-25',
      });

    it('is not below a floor the pace stays above', async () => {
      dated();
      const { plan } = await getGoalWeightPlan('u1');
      expect(plan?.suggestedCalories).toBe(1540);
      expect(plan?.belowFloor).toBe(false);
      expect(plan?.floorKcal).toBe(1200);
      expect(plan?.fastestKgPerWeek).toBeNull();
    });

    it('Standard with the RMR above the clinical minimum: warns, offers the fastest allowed pace and its date', async () => {
      dated();
      mocked(getEffectiveCalorieSafetyFloor).mockResolvedValue({
        enforcedKcal: 1900,
        standardKcal: 1900,
        mode: 'standard',
      });
      const { plan } = await getGoalWeightPlan('u1');
      expect(plan?.belowFloor).toBe(true);
      expect(plan?.floorEnforced).toBe(true);
      expect(plan?.floorKcal).toBe(1900);
      // (1900 - 2400) x 7 / 6000 kg a week.
      expect(plan?.fastestKgPerWeek).toBe(-0.58);
      expect(plan?.earliestDate).not.toBeNull();
      expect((plan?.earliestDate ?? '') > '2027-03-12').toBe(true);
    });

    it("Custom floor: judged against the person's value", async () => {
      dated();
      mocked(getEffectiveCalorieSafetyFloor).mockResolvedValue({
        enforcedKcal: 1600,
        standardKcal: 1900,
        mode: 'custom',
      });
      const { plan } = await getGoalWeightPlan('u1');
      expect(plan?.belowFloor).toBe(true);
      expect(plan?.floorEnforced).toBe(true);
      expect(plan?.floorKcal).toBe(1600);
      expect(plan?.fastestKgPerWeek).toBe(-0.93);
    });

    it('Disabled: still warned against the standard floor, but not enforced', async () => {
      dated();
      mocked(getEffectiveCalorieSafetyFloor).mockResolvedValue({
        enforcedKcal: null,
        standardKcal: 1900,
        mode: 'disabled',
      });
      const { plan } = await getGoalWeightPlan('u1');
      expect(plan?.belowFloor).toBe(true);
      expect(plan?.floorEnforced).toBe(false);
      expect(plan?.floorKcal).toBe(1900);
    });
  });
});
