import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { HeatmapResponse } from '@workspace/shared';
import { heatmapQueryKey } from '../hooks/queryKeys';
import { fetchHeatmap, type HeatmapParams } from './api/heatmapApi';

/**
 * The personal heatmap for a filter and view. The previous answer stays on
 * screen while a new view loads, so panning does not blank the map. Always
 * refetched on mount: a run saved a moment ago should show.
 */
export function useHeatmap(
  params: HeatmapParams,
  enabled = true
): {
  data: HeatmapResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: heatmapQueryKey(params),
    queryFn: () => fetchHeatmap(params),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return { data, isLoading, isFetching, isError, refetch };
}
