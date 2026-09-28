import { renderHook, waitFor } from '@testing-library/react-native';
import { useCaloriesRange } from '../../src/hooks/useCaloriesRange';
import { useNutritionTrends } from '../../src/hooks/useNutritionTrends';
import { fetchNutritionTrends } from '../../src/services/api/reportsApi';
import { nutritionTrendsQueryKey } from '../../src/hooks/queryKeys';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/reportsApi', () => ({
  fetchNutritionTrends: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchNutritionTrends = fetchNutritionTrends as jest.MockedFunction<
  typeof fetchNutritionTrends
>;

const today = getTodayDate();

describe('useCaloriesRange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchNutritionTrends.mockResolvedValue([]);
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('emits one point per day for a 7d window', async () => {
    const { result } = renderHook(() => useCaloriesRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.caloriesData).toHaveLength(7);
  });

  test('zero-fills a day the server did not return', async () => {
    const threeDaysAgo = addDays(today, -3);
    mockFetchNutritionTrends.mockResolvedValue([
      {
        date: threeDaysAgo,
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 30,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
        caffeine_mg: 0,
        water_ml: 0,
        alcohol_g: 0,
      },
    ]);

    const { result } = renderHook(() => useCaloriesRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const todayPoint = result.current.caloriesData.find(
      (point) => point.day === today
    );
    expect(todayPoint).toEqual({
      day: today,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });

    const loggedPoint = result.current.caloriesData.find(
      (point) => point.day === threeDaysAgo
    );
    expect(loggedPoint).toEqual({
      day: threeDaysAgo,
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 70,
    });
  });

  test('shares its cached fetch with useNutritionTrends for the same window', async () => {
    const { result: caloriesResult } = renderHook(
      () => useCaloriesRange({ range: '7d' }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    const { result: trendsResult } = renderHook(
      () => useNutritionTrends({ range: '7d' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(caloriesResult.current.isLoading).toBe(false);
      expect(trendsResult.current.isLoading).toBe(false);
    });

    expect(mockFetchNutritionTrends).toHaveBeenCalledTimes(1);
    expect(mockFetchNutritionTrends).toHaveBeenCalledWith(
      addDays(today, -6),
      today
    );
    expect(
      queryClient.getQueryData(
        nutritionTrendsQueryKey(addDays(today, -6), today)
      )
    ).toBeDefined();
  });

  test('issues no request when disabled', async () => {
    const { result } = renderHook(
      () => useCaloriesRange({ range: '7d', enabled: false }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetchNutritionTrends).not.toHaveBeenCalled();
    expect(result.current.caloriesData).toEqual([]);
  });
});
