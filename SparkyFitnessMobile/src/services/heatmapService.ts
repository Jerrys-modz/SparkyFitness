import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { HeatmapResponse, HeatmapTracksResponse } from '@workspace/shared';
import { heatmapQueryKey, heatmapTracksQueryKey } from '../hooks/queryKeys';
import {
  fetchHeatmap,
  fetchHeatmapTracks,
  type HeatmapParams,
  type HeatmapTracksParams,
} from './api/heatmapApi';

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

/**
 * The person's own tracks inside a map box, for drawing street-level lines.
 * The previous answer stays while a new box loads. A failure is not retried:
 * the screen falls back to the grid.
 */
export function useHeatmapTracks(
  params: HeatmapTracksParams | undefined,
  enabled = true
): {
  data: HeatmapTracksResponse | undefined;
  isFetching: boolean;
  isError: boolean;
} {
  const { data, isFetching, isError } = useQuery({
    queryKey: heatmapTracksQueryKey(params),
    queryFn: () => fetchHeatmapTracks(params as HeatmapTracksParams),
    enabled: enabled && params !== undefined,
    staleTime: 60_000,
    // Panning keeps the last box on screen, but a new filter never shows the
    // old filter's lines.
    placeholderData: (previousData, previousQuery) => {
      const previous = previousQuery?.queryKey[2] as
        HeatmapTracksParams | undefined;
      return previous &&
        params &&
        previous.from === params.from &&
        (previous.activities ?? []).join(',') ===
          (params.activities ?? []).join(',')
        ? previousData
        : undefined;
    },
    retry: false,
  });
  return { data, isFetching, isError };
}
