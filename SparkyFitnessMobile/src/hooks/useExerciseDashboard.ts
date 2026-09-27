import { useQuery } from '@tanstack/react-query';
import { fetchExerciseDashboard } from '../services/api/reportsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { exerciseDashboardQueryKey } from './queryKeys';
import { trendRangeBounds, type TrendRange } from '../utils/trendRange';

export function useExerciseDashboard(range: TrendRange) {
  const { startDate, endDate } = trendRangeBounds(range);

  const query = useQuery({
    queryKey: exerciseDashboardQueryKey(startDate, endDate),
    queryFn: () => fetchExerciseDashboard(startDate, endDate),
  });

  // Default staleTime is Infinity. Coming back from logging a workout should
  // show it, so refetch whenever the screen regains focus.
  useRefetchOnFocus(query.refetch);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
