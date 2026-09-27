import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchExerciseDashboard } from '../services/api/reportsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { exerciseDashboardQueryKey } from './queryKeys';
import { getTodayDate } from '../utils/dateUtils';
import { trendRangeBounds, type TrendRange } from '../utils/trendRange';

export function useExerciseDashboard(range: TrendRange) {
  // Held in state so a screen left open past midnight moves its range
  // forward on the next focus instead of refetching yesterday's window.
  const [today, setToday] = useState(getTodayDate);
  const { startDate, endDate } = trendRangeBounds(range, today);

  const query = useQuery({
    queryKey: exerciseDashboardQueryKey(startDate, endDate),
    queryFn: () => fetchExerciseDashboard(startDate, endDate),
  });

  const { refetch } = query;
  // Default staleTime is Infinity. Coming back from logging a workout should
  // show it, so refetch whenever the screen regains focus. A new day changes
  // the query key instead, which fetches on its own.
  const refreshOnFocus = useCallback(() => {
    const now = getTodayDate();
    if (now !== today) {
      setToday(now);
      return;
    }
    void refetch();
  }, [today, refetch]);
  useRefetchOnFocus(refreshOnFocus);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch,
  };
}
