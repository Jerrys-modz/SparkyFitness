import { useQuery } from '@tanstack/react-query';

import { fetchNutritionTrends } from '../services/api/reportsApi';
import { addDays } from '../utils/dateUtils';
import {
  WIDGET_STREAK_WINDOW_DAYS,
  currentLoggingStreak,
} from '../utils/widgetExtras';
import { nutritionTrendsQueryKey } from './queryKeys';

/**
 * Consecutive days with food logged, ending `today`, or undefined while it
 * loads or is switched off. Reads the same nutrition trends the reports use.
 */
export function useLoggingStreak(
  today: string | undefined,
  enabled: boolean
): number | undefined {
  const startDate = today
    ? addDays(today, -(WIDGET_STREAK_WINDOW_DAYS - 1))
    : '';
  const query = useQuery({
    queryKey: nutritionTrendsQueryKey(startDate, today ?? ''),
    queryFn: () => fetchNutritionTrends(startDate, today as string),
    enabled: enabled && !!today,
  });
  if (!query.data || !today) return undefined;
  return currentLoggingStreak(query.data, today);
}
