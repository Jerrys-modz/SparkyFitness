import { logFuelingPortion } from '../../src/services/fuelingLog';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { fetchMealTypes } from '../../src/services/api/mealTypesApi';
import { invalidateFoodCache } from '../../src/hooks/invalidateFoodCache';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/mealTypesApi', () => ({
  fetchMealTypes: jest.fn(),
}));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: jest.fn(),
}));
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));

const mockCreate = createFoodEntry as jest.Mock;
const mockMealTypes = fetchMealTypes as jest.Mock;
const mockInvalidate = invalidateFoodCache as jest.Mock;

const mealType = (id: string, name: string, isVisible = true) => ({
  id,
  name,
  sort_order: 1,
  user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  is_visible: isVisible,
  show_in_quick_log: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMealTypes.mockResolvedValue([
    mealType('b', 'Breakfast'),
    mealType('s', 'Snacks'),
  ]);
  mockCreate.mockResolvedValue({ entry_date: '2026-10-27' });
});

describe('logFuelingPortion', () => {
  it('logs the portion under Snacks at the current time and refreshes the diary', async () => {
    await logFuelingPortion(
      { productName: 'Energy gel', portionGrams: 25 },
      new Date(2026, 9, 27, 7, 5)
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_type_id: 's',
        entry_time: '07:05',
        food_name: 'Energy gel',
        carbs: 25,
        calories: 100,
      })
    );
    expect(mockInvalidate).toHaveBeenCalledWith({}, '2026-10-27');
  });

  it('ignores hidden meal types', async () => {
    mockMealTypes.mockResolvedValue([
      mealType('s', 'Snacks', false),
      mealType('b', 'Breakfast'),
    ]);
    await logFuelingPortion({ productName: 'Gel', portionGrams: 20 });
    expect(mockCreate.mock.calls[0][0].meal_type_id).toBe('b');
  });

  it('fails without logging when there is no meal type', async () => {
    mockMealTypes.mockResolvedValue([]);
    await expect(
      logFuelingPortion({ productName: 'Gel', portionGrams: 20 })
    ).rejects.toThrow('No meal type');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not refresh the diary when the server refuses', async () => {
    mockCreate.mockRejectedValue(new Error('403'));
    await expect(
      logFuelingPortion({ productName: 'Gel', portionGrams: 20 })
    ).rejects.toThrow('403');
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
