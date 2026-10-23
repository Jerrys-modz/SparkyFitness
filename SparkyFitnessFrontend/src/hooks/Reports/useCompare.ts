import { useQueries, useQuery } from '@tanstack/react-query';
import type { CompareQuery } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { reportKeys } from '@/api/keys/reports';
import { getCompare } from '@/api/Reports/compareApi';
import { useAuth } from '@/hooks/useAuth';

// Short enough that coming back to the tab after logging something refetches.
const COMPARE_STALE_MS = 60_000;

type Timing = -1 | 0 | 1;

export const useCompare = (query: CompareQuery | null) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.activeUserId;
  return useQuery({
    queryKey: query
      ? reportKeys.compare(query, userId)
      : (['reports', 'compare', 'idle'] as const),
    queryFn: () => getCompare(query!),
    enabled: query !== null,
    staleTime: COMPARE_STALE_MS,
    meta: {
      errorMessage: t(
        'compareReport.loadFailed',
        "Couldn't load this comparison"
      ),
    },
  });
};

/** The same pair read at the other timings, for the "other timings" rows. A failed row stays quiet. */
export const useCompareTimings = (base: CompareQuery | null) => {
  const { user } = useAuth();
  const userId = user?.activeUserId;
  const all: readonly Timing[] = base?.mode === 'week' ? [0, 1] : [-1, 0, 1];
  const timings = all.filter((timing) => timing !== base?.timing);
  const results = useQueries({
    queries: timings.map((timing) => {
      const query = base ? { ...base, timing } : null;
      return {
        queryKey: query
          ? reportKeys.compare(query, userId)
          : (['reports', 'compare', 'idle', timing] as const),
        queryFn: () => getCompare(query!),
        enabled: query !== null,
        staleTime: COMPARE_STALE_MS,
      };
    }),
  });
  return timings.map((timing, i) => ({ timing, query: results[i]! }));
};
