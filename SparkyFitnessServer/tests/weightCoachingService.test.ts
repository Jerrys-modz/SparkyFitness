import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { addDays } from '@workspace/shared';
import goalService from '../services/goalService.js';
import { buildGoalTimelinePayload } from '../utils/goalTimelinePayload.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import weightCoachingRepository from '../models/weightCoachingRepository.js';
import {
  CoachingConflictError,
  acceptCoachingCheckIn,
  getCoachingCheckIn,
} from '../services/weightCoachingService.js';

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCheckInMeasurementsByDateRange: vi.fn(),
    getLatestMeasurement: vi.fn(),
  },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: vi.fn() },
}));
vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../models/weightCoachingRepository.js', () => ({
  default: { getCoachingSettings: vi.fn(), updateCoachingSettings: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: vi.fn(), manageGoalTimeline: vi.fn() },
}));

const USER = 'user-1';
const TODAY = '2026-12-01';
const mocked = {
  checkIns: vi.mocked(measurementRepository.getCheckInMeasurementsByDateRange),
  latest: vi.mocked(measurementRepository.getLatestMeasurement),
  nutrition: vi.mocked(reportRepository.getNutritionData),
  profile: vi.mocked(userRepository.getUserProfile),
  prefs: vi.mocked(preferenceRepository.getUserPreferences),
  settings: vi.mocked(weightCoachingRepository.getCoachingSettings),
  goals: vi.mocked(goalService.getUserGoals),
  manage: vi.mocked(goalService.manageGoalTimeline),
};

const STORED_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 55,
  water_goal_ml: 2500,
  dietary_fiber: 30,
  protein_percentage: null,
  carbs_percentage: null,
  fat_percentage: null,
  custom_nutrients: { Iodine: 150 },
  custom_meal_percentages: { Brunch: 10 },
};

/** Flat weight on 2000 kcal for 60 days: behind a 0.5 kg/week loss goal. */
function seedFlatWeight() {
  const checkIns = [];
  const nutrition = [];
  for (let d = 59; d >= 0; d--) {
    const date = addDays(TODAY, -d);
    // Newest first, like the repository, with a stale duplicate for one day.
    checkIns.push({
      entry_date: date,
      weight: String(80 + 0.2 * Math.sin(d * 2.1)),
    });
    nutrition.push({ date, calories: 2000 });
  }
  checkIns.reverse();
  checkIns.push({ entry_date: addDays(TODAY, -3), weight: '95' });
  mocked.checkIns.mockResolvedValue(checkIns);
  mocked.nutrition.mockResolvedValue(nutrition);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  seedFlatWeight();
  mocked.settings.mockResolvedValue({
    direction: 'lose',
    rateKgPerWeek: 0.5,
    checkInWeekday: 2,
  });
  mocked.latest.mockResolvedValue({ weight: '80', height: '175' });
  mocked.profile.mockResolvedValue({
    gender: 'male',
    date_of_birth: '1990-01-01',
  });
  mocked.prefs.mockResolvedValue({
    calorie_goal_adjustment_mode: 'dynamic',
    goal_mode: 'maintain',
    goal_mode_calculation_method: 'manual',
    calorie_safety_floor_mode: 'standard',
  });
  mocked.goals.mockResolvedValue({ ...STORED_GOALS });
  mocked.manage.mockResolvedValue({ message: 'ok' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getCoachingCheckIn', () => {
  it('builds the check-in from weigh-ins, logged intake and the stored goal', async () => {
    const result = await getCoachingCheckIn(USER, USER);

    expect(result.asOf).toBe(TODAY);
    expect(result.reason).toBe('behind');
    expect(result.actionable).toBe(true);
    expect(result.current.calories).toBe(2000);
    expect(result.suggested!.calories).toBe(1800);
    expect(result.settings).toEqual({
      direction: 'lose',
      rateKgPerWeek: 0.5,
      checkInWeekday: 2,
    });
    // 2026-12-01 is a Tuesday; the check-in day is 2.
    expect(result.checkInDue).toBe(true);
    expect(result.goalManagedBySettings).toBe(false);
    // The 95 kg duplicate row is the older reading of that day and is ignored.
    expect(result.trend.series.some((p) => p.weightKg === 95)).toBe(false);
  });

  it('reads the goal the person actually sees, adjusted, as the current target', async () => {
    await getCoachingCheckIn(USER, USER);
    expect(mocked.goals).toHaveBeenCalledWith(USER, TODAY, undefined, true);
  });

  it('flags a calorie target that Calorie Settings derive', async () => {
    mocked.prefs.mockResolvedValue({
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'adaptive',
    });
    expect((await getCoachingCheckIn(USER, USER)).goalManagedBySettings).toBe(
      true
    );
    mocked.prefs.mockResolvedValue({
      goal_mode: 'cut',
      goal_mode_calculation_method: 'manual',
    });
    expect((await getCoachingCheckIn(USER, USER)).goalManagedBySettings).toBe(
      true
    );
  });

  it('keeps proposals above the absolute minimum even with the floor switched off', async () => {
    mocked.prefs.mockResolvedValue({
      goal_mode: 'maintain',
      calorie_safety_floor_mode: 'disabled',
    });
    mocked.settings.mockResolvedValue({
      direction: 'lose',
      rateKgPerWeek: 1,
      checkInWeekday: 0,
    });
    mocked.goals.mockResolvedValue({ ...STORED_GOALS, calories: 820 });
    const result = await getCoachingCheckIn(USER, USER);
    expect(result.suggested === null || result.suggested.calories >= 800).toBe(
      true
    );
  });

  it('says there is not enough data when nothing is logged', async () => {
    mocked.checkIns.mockResolvedValue([]);
    mocked.nutrition.mockResolvedValue([]);
    const result = await getCoachingCheckIn(USER, USER);
    expect(result.reason).toBe('insufficient-data');
    expect(result.suggested).toBeNull();
  });
});

describe('acceptCoachingCheckIn', () => {
  it('saves the shown targets through the goals timeline, carrying other goals forward', async () => {
    const shown = (await getCoachingCheckIn(USER, USER)).suggested!;
    await acceptCoachingCheckIn(USER, shown.calories);

    expect(mocked.manage).toHaveBeenCalledTimes(1);
    const [userId, payload] = mocked.manage.mock.calls[0]! as [
      string,
      Record<string, unknown>,
    ];
    expect(userId).toBe(USER);
    expect(payload).toMatchObject({
      p_start_date: TODAY,
      p_cascade: true,
      p_calories: shown.calories,
      p_protein: shown.protein,
      p_carbs: shown.carbs,
      p_fat: shown.fat,
      p_water_goal_ml: 2500,
      p_dietary_fiber: 30,
      custom_nutrients: { Iodine: 150 },
      custom_meal_percentages: { Brunch: 10 },
    });
  });

  it('keeps a goal stored as percentages in percentages when the split is unchanged', async () => {
    mocked.goals.mockResolvedValue({
      ...STORED_GOALS,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      protein: 150,
      carbs: 200,
      fat: 67,
    });
    const check = await getCoachingCheckIn(USER, USER);
    expect(check.proteinFloorApplied).toBe(false);
    await acceptCoachingCheckIn(USER, check.suggested!.calories);

    const payload = mocked.manage.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      p_calories: check.suggested!.calories,
      p_protein_percentage: 30,
      p_carbs_percentage: 40,
      p_fat_percentage: 30,
    });
    expect(payload.p_protein).toBe(150);
  });

  it('refuses when the shown calories no longer match', async () => {
    const shown = (await getCoachingCheckIn(USER, USER)).suggested!;
    await expect(
      acceptCoachingCheckIn(USER, shown.calories + 50)
    ).rejects.toMatchObject({
      name: 'CoachingConflictError',
      code: 'check-in-changed',
    });
    expect(mocked.manage).not.toHaveBeenCalled();
  });

  it('refuses when nothing is suggested', async () => {
    mocked.checkIns.mockResolvedValue([]);
    mocked.nutrition.mockResolvedValue([]);
    await expect(acceptCoachingCheckIn(USER, 1800)).rejects.toMatchObject({
      code: 'nothing-to-accept',
    });
    expect(mocked.manage).not.toHaveBeenCalled();
  });

  it('refuses when Calorie Settings own the calorie target', async () => {
    mocked.prefs.mockResolvedValue({
      goal_mode_calculation_method: 'adaptive',
    });
    const error = await acceptCoachingCheckIn(USER, 1800).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(CoachingConflictError);
    expect((error as CoachingConflictError).code).toBe(
      'goal-managed-by-settings'
    );
    expect(mocked.manage).not.toHaveBeenCalled();
  });
});

describe('buildGoalTimelinePayload', () => {
  it('carries every goal forward and applies only the overrides given', () => {
    const payload = buildGoalTimelinePayload(
      TODAY,
      { ...STORED_GOALS, protein_percentage: 30, target_steps: 9000 },
      { p_calories: 1900, p_protein: undefined, p_fat: null }
    );
    expect(payload).toMatchObject({
      p_start_date: TODAY,
      p_cascade: true,
      p_calories: 1900,
      p_protein: 150,
      p_fat: 55,
      p_target_steps: 9000,
      p_protein_percentage: 30,
    });
  });

  it('drops stored macro percentages when the grams are being set', () => {
    const payload = buildGoalTimelinePayload(
      TODAY,
      { ...STORED_GOALS, protein_percentage: 30 },
      { p_protein: 140 },
      { keepMacroPercentages: false }
    );
    expect(payload).not.toHaveProperty('p_protein_percentage');
    expect(payload.p_protein).toBe(140);
  });
});
