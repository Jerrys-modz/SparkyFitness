import { useQuery } from '@tanstack/react-query';
import { fetchTrainingLoad } from '../services/api/reportsApi';
import { getTodayDate } from '../utils/dateUtils';
import { trainingLoadQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Acute against chronic workout load over the last four weeks, worked out on
 * the server from every logged workout. A fixed window ending today, so it
 * does not follow the screen's range control. Refreshed on focus because a
 * workout saved elsewhere changes it.
 */
export function useTrainingLoad() {
  const query = useQuery({
    queryKey: trainingLoadQueryKey(getTodayDate()),
    queryFn: fetchTrainingLoad,
  });
  useRefetchOnFocus(query.refetch);

  return {
    load: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
