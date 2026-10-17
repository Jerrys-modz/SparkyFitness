import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from '../services/dailySummaryService';

import { overlayDailySummary } from '../services/offlineQueue/overlay';
import { useOverlayItems } from './useOfflineOverlay';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { dailySummaryQueryKey } from './queryKeys';

import type { DailySummaryRawData } from '../services/dailySummaryService';

export type { DailySummaryRawData };

interface UseDailySummaryOptions {
  date: string;
  enabled?: boolean;
}

export function useDailySummary({
  date,
  enabled = true,
}: UseDailySummaryOptions) {
  // Entries still waiting in the offline queue are laid over the cached day, so
  // the totals include what the person already logged.
  const pending = useOverlayItems();
  const select = useCallback(
    (raw: DailySummaryRawData) =>
      buildDailySummary(date, overlayDailySummary(raw, pending, date)),
    [date, pending]
  );
  const query = useQuery({
    queryKey: dailySummaryQueryKey(date),
    queryFn: () => loadDailySummaryRawData(date),
    select,
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
