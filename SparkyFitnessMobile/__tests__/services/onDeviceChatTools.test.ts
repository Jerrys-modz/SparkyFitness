import {
  formatSearchResults,
  resolveMealType,
  runChatTool,
} from '../../src/services/onDeviceChatTools';
import { searchFoods } from '../../src/services/api/foodsApi';
import { fetchMealTypes } from '../../src/services/api/mealTypesApi';
import {
  createFoodEntry,
  deleteFoodEntry,
} from '../../src/services/api/foodEntriesApi';
import { fetchDailySummary } from '../../src/services/api/dailySummaryApi';
import {
  changeWaterIntake,
  fetchMeasurementsRange,
  fetchWaterContainers,
  upsertCheckIn,
} from '../../src/services/api/measurementsApi';
import { Alert } from 'react-native';

jest.mock('../../src/services/api/foodsApi', () => ({
  searchFoods: jest.fn(),
}));
jest.mock('../../src/services/api/mealTypesApi', () => ({
  fetchMealTypes: jest.fn(),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
  deleteFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn(),
  changeWaterIntake: jest.fn(),
  fetchMeasurementsRange: jest.fn(),
  fetchWaterContainers: jest.fn(),
}));
jest.mock('../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));
jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: jest.fn(),
}));

const egg = {
  id: 'f1',
  name: 'Egg',
  brand: null,
  default_variant: {
    id: 'v1',
    serving_size: 50,
    serving_unit: 'g',
    calories: 70,
    protein: 6,
  },
};
const meals = [
  { id: 'm1', name: 'Breakfast', is_visible: true },
  { id: 'm2', name: 'Snacks', is_visible: true },
  { id: 'm3', name: 'Hidden', is_visible: false },
];

function answerAlert(buttonIndex: number) {
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_t, _m, buttons) =>
      buttons?.[buttonIndex]?.onPress?.()
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  (searchFoods as jest.Mock).mockResolvedValue({ foods: [egg], totalCount: 1 });
  (fetchMealTypes as jest.Mock).mockResolvedValue(meals);
});

describe('chat tools', () => {
  it('numbers search results', () => {
    expect(formatSearchResults([egg as never])).toBe(
      '1. Egg: 70 kcal, 6 g protein per 50 g'
    );
  });

  it('matches meals loosely and ignores hidden ones', () => {
    expect(resolveMealType(meals as never, 'breakfast')?.id).toBe('m1');
    expect(resolveMealType(meals as never, 'snack')?.id).toBe('m2');
    expect(resolveMealType(meals as never, 'hidden')).toBeNull();
  });

  it('logs the searched food only after the user confirms', async () => {
    await runChatTool('searchFoods', JSON.stringify({ query: 'egg' }));
    answerAlert(1);
    const out = await runChatTool(
      'logFood',
      JSON.stringify({ resultNumber: 1, servings: 2, meal: 'Breakfast' })
    );
    expect(createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'f1',
        variant_id: 'v1',
        quantity: 100,
        unit: 'g',
        meal_type_id: 'm1',
      })
    );
    expect(out).toContain('Logged 2 × Egg');
  });

  it('saves nothing when the user cancels', async () => {
    await runChatTool('searchFoods', JSON.stringify({ query: 'egg' }));
    answerAlert(0);
    const out = await runChatTool(
      'logFood',
      JSON.stringify({ resultNumber: 1, servings: 1, meal: 'Breakfast' })
    );
    expect(createFoodEntry).not.toHaveBeenCalled();
    expect(out).toContain('declined');
  });

  it('rejects an unknown result number and silly weights', async () => {
    expect(
      await runChatTool(
        'logFood',
        JSON.stringify({ resultNumber: 9, servings: 1, meal: 'Breakfast' })
      )
    ).toContain('searchFoods');
    expect(
      await runChatTool('logWeight', JSON.stringify({ kilograms: 5 }))
    ).toContain('between');
    expect(upsertCheckIn).not.toHaveBeenCalled();
  });

  it('records a confirmed weight', async () => {
    answerAlert(1);
    await runChatTool('logWeight', JSON.stringify({ kilograms: 82.4 }));
    expect(upsertCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 82.4 })
    );
  });

  it('rounds water to whole drinks of the primary container', async () => {
    (fetchWaterContainers as jest.Mock).mockResolvedValue([
      {
        id: 7,
        name: 'Glass',
        volume: 250,
        servings_per_container: 1,
        is_primary: true,
      },
    ]);
    answerAlert(1);
    const out = await runChatTool(
      'logWater',
      JSON.stringify({ milliliters: 500 })
    );
    expect(changeWaterIntake).toHaveBeenCalledWith(
      expect.objectContaining({ changeDrinks: 2, containerId: 7 })
    );
    expect(out).toContain('500 ml');
  });

  it('refuses water without a measured container or in silly amounts', async () => {
    (fetchWaterContainers as jest.Mock).mockResolvedValue([]);
    expect(
      await runChatTool('logWater', JSON.stringify({ milliliters: 250 }))
    ).toContain('No water container');
    expect(
      await runChatTool('logWater', JSON.stringify({ milliliters: 90000 }))
    ).toContain('between');
    expect(changeWaterIntake).not.toHaveBeenCalled();
  });

  it('logs an estimated food as a standalone entry after confirmation', async () => {
    answerAlert(1);
    await runChatTool(
      'logQuickFood',
      JSON.stringify({
        foodName: 'Burrito',
        calories: 650,
        protein: 30,
        carbs: 70,
        fat: 25,
        meal: 'snack',
      })
    );
    expect(createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        food_name: 'Burrito',
        calories: 650,
        meal_type_id: 'm2',
      })
    );
    expect(
      await runChatTool(
        'logQuickFood',
        JSON.stringify({ foodName: 'x', calories: 99999, meal: 'snack' })
      )
    ).toContain('between');
  });

  it('deletes a listed entry only after confirmation', async () => {
    (fetchDailySummary as jest.Mock).mockResolvedValue({
      foodEntries: [
        {
          id: 'e1',
          meal_type: 'breakfast',
          food_name: 'Eggs',
          calories: 140,
          entry_date: '2026-10-03',
        },
      ],
    });
    const list = await runChatTool('listFoodEntries', '{}');
    expect(list).toBe('1. breakfast: Eggs (140 kcal)');
    answerAlert(0);
    await runChatTool('deleteFoodEntry', JSON.stringify({ entryNumber: 1 }));
    expect(deleteFoodEntry).not.toHaveBeenCalled();
    answerAlert(1);
    await runChatTool('deleteFoodEntry', JSON.stringify({ entryNumber: 1 }));
    expect(deleteFoodEntry).toHaveBeenCalledWith('e1');
  });

  it('reads weight history and rejects an unknown kind', async () => {
    (fetchMeasurementsRange as jest.Mock).mockResolvedValue([
      { entry_date: '2026-10-01', weight: 82 },
      { entry_date: '2026-10-02', weight: null },
    ]);
    expect(
      await runChatTool(
        'getHistory',
        JSON.stringify({ kind: 'weight', days: 7 })
      )
    ).toBe('2026-10-01: 82 kg');
    expect(
      await runChatTool(
        'getHistory',
        JSON.stringify({ kind: 'sleep', days: 7 })
      )
    ).toContain('weight or workouts');
  });
});
