import { useQuery } from '@tanstack/react-query';
import { fetchSleepEntries } from '../services/api/sleepApi';
import { buildSleepAnalytics } from '../utils/sleepAnalytics';
import {
  TREND_RANGE_DAYS,
  trendRangeBounds,
  type TrendRange,
} from '../utils/trendRange';
import { sleepRangeQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Nightly sleep metrics (score, HRV, SpO2, respiration, stress, body battery) for a
 * window. Shares `sleepRangeQueryKey` with the Health Trends sleep chart, so a window both
 * have open is one request and a health sync refreshes both.
 */
export function useSleepAnalytics({ range }: { range: TrendRange }) {
  const { startDate, endDate } = trendRangeBounds(range);

  const query = useQuery({
    queryKey: sleepRangeQueryKey(startDate, endDate),
    queryFn: () => fetchSleepEntries(startDate, endDate),
    select: (entries) =>
      buildSleepAnalytics(entries, startDate, TREND_RANGE_DAYS[range]),
  });

  useRefetchOnFocus(query.refetch);

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
