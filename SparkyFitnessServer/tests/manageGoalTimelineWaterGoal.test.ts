import { vi, beforeEach, describe, expect, it } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import customNutrientService from '../services/customNutrientService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/goalPresetRepository.js', () => ({
  default: {
    getGoalPresetById: vi.fn(),
  },
}));

vi.mock('../models/weeklyGoalPlanRepository.js', () => ({
  default: {
    getActiveWeeklyGoalPlan: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../models/goalRepository.js', () => ({
  default: {
    upsertGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoalsInRange: vi.fn().mockResolvedValue(undefined),
    deleteDefaultGoal: vi.fn().mockResolvedValue(undefined),
    getGoalsInRange: vi.fn().mockResolvedValue([]),
    getMostRecentGoalBeforeDate: vi.fn().mockResolvedValue(null),
    getMostRecentWaterGoalBeforeDate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

describe('manageGoalTimeline water_goal_ml persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customNutrientService.getCustomNutrients).mockResolvedValue([]);
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue(
      null
    );
    vi.mocked(
      goalRepository.getMostRecentWaterGoalBeforeDate
    ).mockResolvedValue(null);
  });

  it('preserves null when water_goal_ml is omitted, instead of coercing to 0', async () => {
    await goalService.manageGoalTimeline('user-1', {
      p_start_date: '2020-01-01',
      p_cascade: false,
      p_calories: 2000,
      p_protein: 150,
      p_carbs: 200,
      p_fat: 60,
      // p_water_goal_ml intentionally omitted, mirroring a preset applied
      // without a water value or any other partial goal update.
    });

    expect(goalRepository.upsertGoal).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(goalRepository.upsertGoal).mock.calls[0][0];
    expect(payload.water_goal_ml).toBeNull();
  });

  it('preserves null when water_goal_ml is explicitly null', async () => {
    await goalService.manageGoalTimeline('user-1', {
      p_start_date: '2020-01-01',
      p_cascade: false,
      p_calories: 2000,
      p_protein: 150,
      p_carbs: 200,
      p_fat: 60,
      p_water_goal_ml: null,
    });

    const payload = vi.mocked(goalRepository.upsertGoal).mock.calls[0][0];
    expect(payload.water_goal_ml).toBeNull();
  });

  it('still stores an explicit water_goal_ml value', async () => {
    await goalService.manageGoalTimeline('user-1', {
      p_start_date: '2020-01-01',
      p_cascade: false,
      p_calories: 2000,
      p_protein: 150,
      p_carbs: 200,
      p_fat: 60,
      p_water_goal_ml: 2500,
    });

    const payload = vi.mocked(goalRepository.upsertGoal).mock.calls[0][0];
    expect(payload.water_goal_ml).toBe(2500);
  });

  it('treats a blank water goal as missing instead of saving 0', async () => {
    await goalService.manageGoalTimeline('user-1', {
      p_start_date: '2020-01-01',
      p_cascade: false,
      p_calories: 2000,
      p_protein: 150,
      p_carbs: 200,
      p_fat: 60,
      p_water_goal_ml: '',
    });

    const payload = vi.mocked(goalRepository.upsertGoal).mock.calls[0][0];
    expect(payload.water_goal_ml).toBeNull();
  });

  it('treats a whitespace-only water goal as missing', async () => {
    await goalService.manageGoalTimeline('user-1', {
      p_start_date: '2020-01-01',
      p_cascade: false,
      p_calories: 2000,
      p_protein: 150,
      p_carbs: 200,
      p_fat: 60,
      p_water_goal_ml: '   ',
    });

    const payload = vi.mocked(goalRepository.upsertGoal).mock.calls[0][0];
    expect(payload.water_goal_ml).toBeNull();
  });

  it('fills the default when a stored water goal is null', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([
      {
        goal_date: '2020-01-01',
        calories: 2000,
        water_goal_ml: null,
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      },
    ] as never);

    const result = await goalService.getUserGoalsForRange(
      'user-1',
      '2020-01-01',
      '2020-01-01'
    );

    expect(
      (result['2020-01-01'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(1920);
  });

  it('keeps a stored water goal on read', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([
      {
        goal_date: '2020-01-01',
        calories: 2000,
        water_goal_ml: 2500,
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      },
    ] as never);

    const result = await goalService.getUserGoalsForRange(
      'user-1',
      '2020-01-01',
      '2020-01-01'
    );

    expect(
      (result['2020-01-01'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(2500);
  });

  it('keeps a prior custom water goal when a weekly preset has none', async () => {
    // 2020-01-01 is a Wednesday.
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      water_goal_ml: 2500,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue({
      wednesday_preset_id: 'preset-1',
    } as never);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      calories: 1800,
      water_goal_ml: null,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    } as never);

    const result = await goalService.getUserGoalsForRange(
      'user-1',
      '2020-01-01',
      '2020-01-01'
    );

    expect(
      (result['2020-01-01'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(2500);
  });

  it('keeps an earlier water goal when a later daily goal omits it', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      water_goal_ml: 2500,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([
      {
        goal_date: '2020-01-01',
        calories: 2100,
        water_goal_ml: null,
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      },
    ] as never);

    const result = await goalService.getUserGoalsForRange(
      'user-1',
      '2020-01-01',
      '2020-01-02'
    );

    expect(
      (result['2020-01-01'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(2500);
    expect(
      (result['2020-01-02'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(2500);
    expect((result['2020-01-01'] as { calories: number }).calories).toBe(2100);
    expect((result['2020-01-02'] as { calories: number }).calories).toBe(2100);
  });

  it('uses an earlier non-null water goal when the latest row before the range omits it', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2100,
      water_goal_ml: null,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(
      goalRepository.getMostRecentWaterGoalBeforeDate
    ).mockResolvedValue({
      water_goal_ml: 2500,
    });

    const result = await goalService.getUserGoalsForRange(
      'user-1',
      '2020-01-01',
      '2020-01-01'
    );

    expect((result['2020-01-01'] as { calories: number }).calories).toBe(2100);
    expect(
      (result['2020-01-01'] as { water_goal_ml: number }).water_goal_ml
    ).toBe(2500);
  });
});
