import type { OnDeviceMealEstimate } from '../../modules/on-device-nutrition';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: { isAvailable: jest.fn(), estimateMeal: jest.fn() },
}));
jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoods: jest.fn().mockResolvedValue({ recentFoods: [], topFoods: [] }),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import mockModuleImport from '../../modules/on-device-nutrition';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import {
  buildKnownFoodsHint,
  mealTitle,
  estimateFoodPhotoOnDevice,
  isPlausibleMealEstimate,
  toFoodPhotoEstimate,
} from '../../src/services/onDeviceFoodPhoto';

const mockModule = jest.mocked(mockModuleImport!);

const meal = (
  over: Partial<OnDeviceMealEstimate> = {}
): OnDeviceMealEstimate => ({
  summary: 'Chicken and rice',
  items: [
    {
      name: 'Grilled chicken',
      grams: 120,
      portion: '1 breast',
      calories: 198,
      protein: 37,
      carbs: 0,
      fat: 4.3,
      fiber: 0,
      sugar: 0,
      confidence: 'high',
    },
    {
      name: 'White rice',
      grams: 150,
      portion: '1 cup',
      calories: 195,
      protein: 4,
      carbs: 43,
      fat: 0.4,
      fiber: 0.6,
      sugar: 0,
      confidence: 'medium',
    },
  ],
  ...over,
});

describe('onDeviceFoodPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModule.isAvailable.mockReturnValue(true);
    useAppPreferencesStore.setState({ onDeviceFoodPhotoEnabled: true });
  });

  it('accepts a realistic meal', () => {
    expect(isPlausibleMealEstimate(meal())).toBe(true);
  });

  it('rejects an empty or oversized item list', () => {
    expect(isPlausibleMealEstimate(meal({ items: [] }))).toBe(false);
    const one = meal().items[0];
    expect(isPlausibleMealEstimate(meal({ items: Array(9).fill(one) }))).toBe(
      false
    );
  });

  it('rejects calories that do not match the macros', () => {
    const items = [{ ...meal().items[0], calories: 900 }];
    expect(isPlausibleMealEstimate(meal({ items }))).toBe(false);
  });

  it('rejects negative or absurd values', () => {
    const base = meal().items[0];
    expect(
      isPlausibleMealEstimate(meal({ items: [{ ...base, grams: 0 }] }))
    ).toBe(false);
    expect(
      isPlausibleMealEstimate(meal({ items: [{ ...base, protein: -1 }] }))
    ).toBe(false);
    expect(
      isPlausibleMealEstimate(meal({ items: [{ ...base, grams: 5000 }] }))
    ).toBe(false);
  });

  it('builds the server estimate shape with totals and lowest confidence', () => {
    const result = toFoodPhotoEstimate(meal());
    expect(result.items).toHaveLength(2);
    expect(result.items[0].item_id).toBe('on-device-0');
    expect(result.totals.total_grams).toBe(270);
    expect(result.totals.calories_kcal).toBe(393);
    expect(result.totals.protein_g).toBe(41);
    expect(result.overall_confidence).toBe('medium');
  });

  it('treats unknown confidence as low', () => {
    const items = [{ ...meal().items[0], confidence: 'certain' }];
    expect(toFoodPhotoEstimate(meal({ items })).overall_confidence).toBe('low');
  });

  it('returns null when the preference is off', async () => {
    useAppPreferencesStore.setState({ onDeviceFoodPhotoEnabled: false });
    expect(await estimateFoodPhotoOnDevice({ base64Images: ['x'] })).toBeNull();
    expect(mockModule.estimateMeal).not.toHaveBeenCalled();
  });

  it('returns null when the model is unavailable', async () => {
    mockModule.isAvailable.mockReturnValue(false);
    expect(await estimateFoodPhotoOnDevice({ base64Images: ['x'] })).toBeNull();
  });

  it('passes the description and weight, and returns the estimate', async () => {
    mockModule.estimateMeal.mockResolvedValue(meal());
    const result = await estimateFoodPhotoOnDevice({
      base64Images: ['x', 'y'],
      description: ' lunch ',
      totalWeightGrams: 300,
    });
    expect(mockModule.estimateMeal).toHaveBeenCalledWith(
      ['x', 'y'],
      'lunch',
      300,
      null
    );
    expect(result?.meal_summary).toBe('Chicken and rice');
  });

  it('returns null when the module throws or the estimate is implausible', async () => {
    mockModule.estimateMeal.mockRejectedValueOnce(new Error('boom'));
    expect(await estimateFoodPhotoOnDevice({ base64Images: ['x'] })).toBeNull();
    mockModule.estimateMeal.mockResolvedValueOnce(meal({ items: [] }));
    expect(await estimateFoodPhotoOnDevice({ base64Images: ['x'] })).toBeNull();
  });

  it('tells the model the foods the person already has', async () => {
    const { fetchFoods } = jest.requireMock(
      '../../src/services/api/foodsApi'
    ) as { fetchFoods: jest.Mock };
    fetchFoods.mockResolvedValueOnce({
      recentFoods: [{ id: '1', name: 'Ranch Flavor Tortilla Chips' }],
      topFoods: [],
    });
    mockModule.isAvailable.mockReturnValue(true);
    mockModule.estimateMeal.mockResolvedValue(meal());
    useAppPreferencesStore.setState({
      onDeviceFoodPhotoEnabled: true,
      aiUserContext: 'vegetarian',
    });
    await estimateFoodPhotoOnDevice({ base64Images: ['a'] });
    const context = mockModule.estimateMeal.mock.calls.at(-1)?.[3] as string;
    expect(context).toContain('vegetarian');
    expect(context).toContain('Ranch Flavor Tortilla Chips');
  });

  it('keeps a short title and replaces a sentence with the main foods', () => {
    expect(mealTitle('Chicken and rice', ['x'])).toBe('Chicken and rice');
    expect(
      mealTitle('A bowl of Buffalo chicken wing dip and a serving of chips.', [
        'Buffalo chicken wing dip',
        'chips',
      ])
    ).toBe('Buffalo chicken wing dip and chips');
    expect(mealTitle('', ['eggs', 'toast', 'bacon', 'fruit'])).toBe(
      'Eggs, toast and bacon'
    );
  });

  it('builds a short, de-duplicated list of known foods', () => {
    expect(buildKnownFoodsHint(undefined)).toBeNull();
    expect(buildKnownFoodsHint({ recentFoods: [], topFoods: [] })).toBeNull();
    const hint = buildKnownFoodsHint({
      topFoods: [
        { id: '1', name: 'Greek Yogurt', usage_count: 2 },
        { id: '2', name: 'Oats', usage_count: 9 },
      ],
      recentFoods: [
        { id: '3', name: 'greek yogurt' },
        { id: '4', name: 'Quick estimate', is_quick_food: true },
        { id: '5', name: '  ' },
      ],
    } as never);
    expect(hint).toContain('Oats; Greek Yogurt.');
    expect(hint).not.toContain('Quick estimate');
    expect(hint).not.toContain('greek yogurt;');
  });

  it('passes the user notes along and refuses too many photos', async () => {
    mockModule.isAvailable.mockReturnValue(true);
    mockModule.estimateMeal.mockResolvedValue(meal());
    useAppPreferencesStore.setState({
      onDeviceFoodPhotoEnabled: true,
      aiUserContext: '  vegetarian  ',
    });
    await estimateFoodPhotoOnDevice({ base64Images: ['a'] });
    expect(mockModule.estimateMeal).toHaveBeenCalledWith(
      ['a'],
      null,
      null,
      'vegetarian'
    );
    mockModule.estimateMeal.mockClear();
    expect(
      await estimateFoodPhotoOnDevice({
        base64Images: ['1', '2', '3', '4', '5'],
      })
    ).toBeNull();
    expect(mockModule.estimateMeal).not.toHaveBeenCalled();
  });
});
