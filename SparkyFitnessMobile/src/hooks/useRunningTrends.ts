import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  buildRunningTrends,
  startOfWeek,
  type ExerciseActivityQueryItem,
} from '@workspace/shared';
import { fetchCardioSessionsPage } from '../services/api/exerciseStatsApi';
import { runningTrendsQueryKey } from './queryKeys';
import { getTodayDate } from '../utils/dateUtils';

/** Weeks of running shown on the trends card. */
export const RUNNING_TRENDS_WEEKS = 12;
const PAGE_SIZE = 100;
/** A safety stop; 12 weeks of workouts is a few pages at most. */
const MAX_PAGES = 10;

async function fetchWindow(
  startDate: string,
  endDate: string
): Promise<ExerciseActivityQueryItem[]> {
  const items: ExerciseActivityQueryItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchCardioSessionsPage({
      startDate,
      endDate,
      page,
      pageSize: PAGE_SIZE,
      unitSystem: 'metric',
    });
    items.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return items;
}

/**
 * Weekly mileage, longest run and efficiency over the last twelve weeks. Its
 * key sits in the `cardioSessions` family, so the Cardio view's refresh and
 * the exercise cache invalidation reload it with the session list.
 */
export function useRunningTrends(enabled = true) {
  const today = getTodayDate();
  const startDate = addDays(
    startOfWeek(today),
    -7 * (RUNNING_TRENDS_WEEKS - 1)
  );

  const query = useQuery({
    queryKey: runningTrendsQueryKey(startDate, today),
    queryFn: () => fetchWindow(startDate, today),
    enabled,
  });

  const trends = useMemo(
    () =>
      query.data
        ? buildRunningTrends(query.data, {
            today,
            weeks: RUNNING_TRENDS_WEEKS,
          })
        : null,
    [query.data, today]
  );

  return { trends, isLoading: query.isLoading, isError: query.isError };
}
