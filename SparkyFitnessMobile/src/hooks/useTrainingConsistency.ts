import { useQuery } from '@tanstack/react-query';
import type { TrainingConsistencyModality } from '@workspace/shared';
import { fetchTrainingConsistency } from '../services/api/reportsApi';
import { trainingConsistencyQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Training days, weekly streak and this-vs-last-week sets per muscle. A fixed
 * window on the server, so it does not follow the screen's range control.
 * Refreshed on focus because a workout logged elsewhere changes it.
 * `modality` limits the training days to the screen's selected view.
 */
export function useTrainingConsistency(modality: TrainingConsistencyModality) {
  const query = useQuery({
    queryKey: trainingConsistencyQueryKey(modality),
    queryFn: () => fetchTrainingConsistency(modality),
  });
  useRefetchOnFocus(query.refetch);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
