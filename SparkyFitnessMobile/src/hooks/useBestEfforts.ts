import { useQuery } from '@tanstack/react-query';
import { fetchBestEfforts } from '../services/api/exerciseStatsApi';
import { bestEffortsQueryKey } from './queryKeys';

/**
 * The all-time best efforts board: the fastest stretch of each distance found
 * inside any run. Always re-read on mount, since a run saved a moment ago can
 * hold a new best.
 */
export function useBestEfforts(enabled = true) {
  const query = useQuery({
    queryKey: bestEffortsQueryKey(),
    queryFn: fetchBestEfforts,
    staleTime: 0,
    enabled,
  });
  return {
    efforts: query.data?.efforts ?? [],
    runsAnalyzed: query.data?.runsAnalyzed ?? 0,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
