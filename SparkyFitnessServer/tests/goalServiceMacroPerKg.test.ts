import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalPresetService from '../services/goalPresetService.js';
import goalRepository from '../models/goalRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import measurementRepository from '../models/measurementRepository.js';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/customNutrientService.js', () => ({
  default: { getCustomNutrients: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

// 2026-11-02 is a Monday.
const monday = '2026-11-02';
const wednesday = '2026-11-04';

const perKgGoal = {
  goal_date: monday,
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 70,
  dietary_fiber: 0,
  protein_percentage: 30,
  carbs_percentage: 40,
  fat_percentage: 30,
  // Postgres returns NUMERIC as a string.
  protein_per_kg: '2.00',
  fat_per_kg: null,
  macro_per_kg_basis: 'body_weight',
};

type DayGoals = {
  protein: number;
  carbs: number;
  fat: number;
  protein_per_kg: number | null;
  macro_per_kg: {
    weight_kg: number | null;
    missing_weight: boolean;
    lean_mass_fallback: boolean;
    basis_used: string | null;
  } | null;
};

const range = () =>
  goalService.getUserGoalsForRange(
    'user-1',
    monday,
    wednesday,
    false
  ) as Promise<Record<string, DayGoals>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue(
    undefined
  );
  vi.mocked(goalRepository.getGoalByDate).mockResolvedValue(undefined);
  vi.mocked(
    weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
  ).mockResolvedValue([]);
  vi.mocked(
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
  ).mockResolvedValue(null);
  vi.mocked(
    measurementRepository.getCheckInMeasurementsByDateRange
  ).mockResolvedValue([]);
});

describe('getUserGoalsForRange with protein per kg', () => {
  it('works protein out from the latest weight on or before each day', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([perKgGoal]);
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2026-11-01', weight: '90' });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-11-03', weight: '85' }]);

    const days = await range();

    expect(days[monday].protein).toBe(180);
    expect(days[monday].protein_per_kg).toBe(2);
    expect(days[monday].macro_per_kg).toMatchObject({
      weight_kg: 90,
      missing_weight: false,
      basis_used: 'body_weight',
    });
    // The weight logged on Tuesday carries forward to Wednesday.
    expect(days[wednesday].protein).toBe(170);
    // Carbs and fat share 2000 - 680 kcal by 40:30.
    expect(days[wednesday].carbs).toBeCloseTo((1320 * (40 / 70)) / 4);
    expect(days[wednesday].fat).toBeCloseTo((1320 * (30 / 70)) / 9);
  });

  it('keeps the saved grams and flags it when no weight is logged', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([perKgGoal]);

    const days = await range();

    expect(days[monday].protein).toBe(150);
    expect(days[monday].macro_per_kg?.missing_weight).toBe(true);
  });

  it('says when lean mass fell back to body weight', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([
      { ...perKgGoal, macro_per_kg_basis: 'lean_mass' },
    ]);
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2026-11-01', weight: 80 });

    const days = await range();

    expect(days[monday].protein).toBe(160);
    expect(days[monday].macro_per_kg?.lean_mass_fallback).toBe(true);
  });

  it('leaves goals without a per-kg setting alone and loads no measurements', async () => {
    const { protein_per_kg: _p, ...gramsGoal } = perKgGoal;
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([
      { ...gramsGoal, protein_per_kg: null },
    ]);

    const days = await range();

    expect(days[monday].protein).toBeCloseTo((2000 * 0.3) / 4);
    expect(days[monday].macro_per_kg).toBeNull();
    expect(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).not.toHaveBeenCalled();
  });

  it('applies a per-kg preset from a weekly goal plan', async () => {
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      {
        id: 'plan-1',
        user_id: 'user-1',
        plan_name: 'Week',
        start_date: '2026-10-01',
        end_date: null,
        is_active: true,
        monday_preset_id: 'preset-1',
      },
    ]);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      ...perKgGoal,
      id: 'preset-1',
      water_goal: 2000,
      protein_per_kg: '1.6',
      fat_per_kg: '0.8',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2026-11-01', weight: 100 });

    const days = await range();

    expect(days[monday].protein).toBeCloseTo(160);
    expect(days[monday].fat).toBeCloseTo(80);
    // Carbs take everything left: 2000 - 640 - 720.
    expect(days[monday].carbs).toBeCloseTo(640 / 4);
  });
});

describe('manageGoalTimeline with per-kg goals', () => {
  const body = {
    p_start_date: '2020-01-01', // a past day: single upsert, no cascade
    p_cascade: false,
    p_calories: 2000,
    p_protein: 150,
    p_carbs: 200,
    p_fat: 70,
    p_protein_percentage: null,
    p_carbs_percentage: null,
    p_fat_percentage: null,
  };

  it('saves the setting with grams from the weight on the start day', async () => {
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2019-12-30', weight: 70 });

    await goalService.manageGoalTimeline('user-1', {
      ...body,
      p_protein_per_kg: 2,
      p_fat_per_kg: null,
      p_macro_per_kg_basis: 'body_weight',
    });

    expect(goalRepository.upsertGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        protein: 140,
        carbs: 200,
        fat: 70,
        protein_per_kg: 2,
        fat_per_kg: null,
        macro_per_kg_basis: 'body_weight',
      })
    );
  });

  it('keeps the setting in force when an older client omits it', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      protein_per_kg: '1.80',
      fat_per_kg: null,
      macro_per_kg_basis: 'body_weight',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2019-12-30', weight: 80 });

    await goalService.manageGoalTimeline('user-1', body);

    expect(goalRepository.upsertGoal).toHaveBeenCalledWith(
      expect.objectContaining({ protein: 144, protein_per_kg: 1.8 })
    );
  });

  it('clears the setting when a client sends null', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      protein_per_kg: '1.80',
    });

    await goalService.manageGoalTimeline('user-1', {
      ...body,
      p_protein_per_kg: null,
      p_fat_per_kg: null,
      p_macro_per_kg_basis: 'body_weight',
    });

    expect(goalRepository.upsertGoal).toHaveBeenCalledWith(
      expect.objectContaining({ protein: 150, protein_per_kg: null })
    );
  });

  it('refuses a value out of range', async () => {
    await expect(
      goalService.manageGoalTimeline('user-1', {
        ...body,
        p_protein_per_kg: 9,
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(goalRepository.upsertGoal).not.toHaveBeenCalled();
  });
});

describe('goal presets with per-kg goals', () => {
  it('saves grams from the latest weight with the setting', async () => {
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2026-11-01', weight: 75 });
    vi.mocked(goalPresetRepository.createGoalPreset).mockResolvedValue({
      id: 'preset-1',
    });

    await goalPresetService.createGoalPreset('user-1', {
      preset_name: 'Cut',
      calories: 2000,
      protein: 100,
      carbs: 200,
      fat: 70,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      protein_per_kg: 2,
      fat_per_kg: 1,
      macro_per_kg_basis: 'body_weight',
    });

    expect(goalPresetRepository.createGoalPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        protein: 150,
        fat: 75,
        // 2000 - 600 - 675 kcal of carbs.
        carbs: 725 / 4,
        protein_per_kg: 2,
        fat_per_kg: 1,
        macro_per_kg_basis: 'body_weight',
      })
    );
  });

  it('keeps the stored setting when an older client updates the preset', async () => {
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      id: 'preset-1',
      protein_per_kg: '2.00',
      fat_per_kg: null,
      macro_per_kg_basis: 'body_weight',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: '2026-11-01', weight: 60 });
    vi.mocked(goalPresetRepository.updateGoalPreset).mockResolvedValue({
      id: 'preset-1',
    });

    await goalPresetService.updateGoalPreset('preset-1', 'user-1', {
      preset_name: 'Cut',
      calories: 2000,
      protein: 100,
      carbs: 200,
      fat: 70,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });

    expect(goalPresetRepository.updateGoalPreset).toHaveBeenCalledWith(
      'preset-1',
      expect.objectContaining({
        protein: 120,
        protein_per_kg: 2,
        macro_per_kg_supplied: true,
      })
    );
  });

  it('refuses an unknown basis', async () => {
    await expect(
      goalPresetService.createGoalPreset('user-1', {
        preset_name: 'Cut',
        protein_per_kg: 2,
        macro_per_kg_basis: 'muscle',
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
