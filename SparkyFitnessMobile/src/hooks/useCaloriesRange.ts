import { useQuery } from '@tanstack/react-query';
import { fetchNutritionTrends } from '../services/api/reportsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { nutritionTrendsQueryKey } from './queryKeys';
import { getTodayDate, addDays } from '../utils/dateUtils';
import {
  RANGE_DAYS,
  type HealthTrendDateRange,
  type CaloriesDataPoint,
} from '../types/healthTrends';

interface UseCaloriesRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

/**
 * Shares `nutritionTrendsQueryKey` with `useNutritionTrends` so a Calories page on the
 * Dashboard and a same-window Nutrient Trends screen reuse one cached fetch.
 */
export function useCaloriesRange({
  range,
  enabled = true,
}: UseCaloriesRangeOptions) {
  const today = getTodayDate();
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: nutritionTrendsQueryKey(startDate, today),
    queryFn: () => fetchNutritionTrends(startDate, today),
    enabled,
    select: (entries) => {
      const byDay = new Map(entries.map((entry) => [entry.date, entry]));

      // A day with no logged food genuinely means zero eaten, so every day in the window
      // gets a bar rather than being omitted the way a missing weigh-in is (#1587).
      const caloriesData: CaloriesDataPoint[] = [];
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const day = addDays(today, -(days - 1 - dayOffset));
        const entry = byDay.get(day);
        caloriesData.push({
          day,
          calories: entry?.calories ?? 0,
          protein: entry?.protein ?? 0,
          carbs: entry?.carbs ?? 0,
          fat: entry?.fat ?? 0,
        });
      }

      return caloriesData;
    },
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    caloriesData: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
