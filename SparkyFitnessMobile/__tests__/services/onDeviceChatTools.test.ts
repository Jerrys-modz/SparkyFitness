import {
  formatSearchResults,
  resolveMealType,
  runChatTool,
} from '../../src/services/onDeviceChatTools';
import { searchFoods } from '../../src/services/api/foodsApi';
import { fetchMealTypes } from '../../src/services/api/mealTypesApi';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { upsertCheckIn } from '../../src/services/api/measurementsApi';
import { Alert } from 'react-native';

jest.mock('../../src/services/api/foodsApi', () => ({
  searchFoods: jest.fn(),
}));
jest.mock('../../src/services/api/mealTypesApi', () => ({
  fetchMealTypes: jest.fn(),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn(),
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
});
