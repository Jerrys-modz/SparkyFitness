import { useQuery } from '@tanstack/react-query';
import { fetchMoodEntries } from '../services/api/moodApi';
import { buildMoodReport } from '../utils/moodReport';
import {
  TREND_RANGE_DAYS,
  trendRangeBounds,
  type TrendRange,
} from '../utils/trendRange';
import { moodEntriesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useMoodReport({ range }: { range: TrendRange }) {
  const { startDate, endDate } = trendRangeBounds(range);

  const query = useQuery({
    queryKey: moodEntriesQueryKey(startDate, endDate),
    queryFn: () => fetchMoodEntries(startDate, endDate),
    select: (entries) =>
      buildMoodReport(entries, startDate, TREND_RANGE_DAYS[range]),
  });

  useRefetchOnFocus(query.refetch);

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
