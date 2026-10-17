import type { QueryClient } from '@tanstack/react-query';
import type { QueueItem } from '../services/offlineQueue/types';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealUsageCaches } from './useMeals';
import { latestMeasurementsOnOrBeforeRootQueryKey } from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';

/**
 * Refreshes what a drained batch of queued writes moved: the diary day of each
 * item (food, water, caffeine, fasting), the measurement family for a weight,
 * and the recent-meal lists a logged meal feeds. Resolves once the refetches
 * have settled so the caller can stop overlaying the items it just sent.
 */
export async function invalidateOfflineQueueCaches(
  queryClient: QueryClient,
  items: readonly QueueItem[]
): Promise<void> {
  if (items.length === 0) return;
  const dates = [...new Set(items.map((item) => item.entryDate))];
  const pending = dates.map((date) => invalidateFoodCache(queryClient, date));
  if (
    items.some((item) => item.kind === 'food_entry' && item.payload.meal_id)
  ) {
    invalidateMealUsageCaches(queryClient);
  }
  if (items.some((item) => item.kind === 'check_in')) {
    refreshHealthSyncCache(queryClient);
    pending.push(
      queryClient.invalidateQueries({
        queryKey: latestMeasurementsOnOrBeforeRootQueryKey,
      })
    );
  }
  await Promise.allSettled(pending);
}
