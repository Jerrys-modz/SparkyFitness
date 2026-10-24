import { useQuery } from '@tanstack/react-query';
import { fetchStrengthVolume } from '../services/api/reportsApi';
import { strengthVolumeQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Weekly hard sets per muscle (this week against last) and the deload
 * suggestion. A fixed window on the server, so it does not follow the range
 * control; refreshed on focus because a workout logged elsewhere changes it.
 */
export function useStrengthVolume() {
  const query = useQuery({
    queryKey: strengthVolumeQueryKey(),
    queryFn: fetchStrengthVolume,
  });
  useRefetchOnFocus(query.refetch);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
