import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  appetiteCategoryIds,
  appetiteMetricsFor,
  buildAppetiteTrend,
  summarizeAppetiteTrend,
} from '@workspace/shared';

import { fetchCustomMeasurementsRange } from '../services/api/measurementsApi';
import { appetiteTrendQueryKey } from './queryKeys';
import { useCustomCategories } from './useCustomMeasurements';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Hunger, fullness and cravings over a report window, joined per day with the
 * calories eaten (`nutrition`, one point per day). Reads only the categories
 * the check-in uses, one range request each.
 */
export function useAppetiteTrend({
  startDate,
  endDate,
  nutrition,
  enabled,
}: {
  startDate: string;
  endDate: string;
  nutrition: readonly { date: string; calories: number | null }[];
  enabled: boolean;
}) {
  const categoriesQuery = useCustomCategories();
  const ids = useMemo(
    () => appetiteCategoryIds(categoriesQuery.data),
    [categoriesQuery.data]
  );
  const categoryIds = appetiteMetricsFor('appetite').flatMap((metric) => {
    const id = ids[metric.key];
    return id ? [id] : [];
  });
  const query = useQuery({
    queryKey: [...appetiteTrendQueryKey(startDate, endDate), categoryIds],
    queryFn: async () =>
      (
        await Promise.all(
          categoryIds.map((id) =>
            fetchCustomMeasurementsRange(id, startDate, endDate)
          )
        )
      ).flat(),
    enabled: enabled && categoryIds.length > 0,
  });
  useRefetchOnFocus(query.refetch, enabled && categoryIds.length > 0);

  const days = useMemo(
    () => buildAppetiteTrend(categoriesQuery.data, query.data, nutrition),
    [categoriesQuery.data, query.data, nutrition]
  );
  const summary = useMemo(() => summarizeAppetiteTrend(days), [days]);
  return { days, summary, isLoading: query.isLoading };
}
