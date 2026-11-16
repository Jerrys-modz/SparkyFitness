import type { QueryClient } from '@tanstack/react-query';
import {
  glucoseContextQueryKeyRoot,
  dailySummaryQueryKey,
  dailySummaryRootQueryKey,
  familyCopySourceQueryKey,
  familyCopySourceRootQueryKey,
  fastingRootQueryKey,
  foodEntriesRangeRootQueryKey,
  foodsQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { invalidateIntakeKinetics } from './invalidateIntakeKinetics';

/**
 * Invalidates every cache a food diary change can move. The returned promise
 * settles once the refetches it started have, for callers that need to know
 * when the fresh data has landed; most callers ignore it.
 */
export function invalidateFoodCache(
  queryClient: QueryClient,
  entryDate?: string
): Promise<void> {
  const pending: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: glucoseContextQueryKeyRoot }),
  ];
  if (entryDate) {
    pending.push(
      queryClient.invalidateQueries({
        queryKey: familyCopySourceQueryKey(entryDate),
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(entryDate),
        refetchType: 'all',
      }),
      invalidateIntakeKinetics(queryClient, entryDate, {
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: waterIntakeLogQueryKey(entryDate),
        refetchType: 'all',
      })
    );
  } else {
    pending.push(
      queryClient.invalidateQueries({
        queryKey: familyCopySourceRootQueryKey,
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: dailySummaryRootQueryKey,
        refetchType: 'all',
      }),
      invalidateIntakeKinetics(queryClient, undefined, {
        refetchType: 'all',
      })
    );
  }
  pending.push(
    queryClient.invalidateQueries({
      queryKey: [...foodsQueryKey],
    }),
    queryClient.invalidateQueries({
      queryKey: fastingRootQueryKey,
      refetchType: 'all',
    }),
    // Nutrient trends read food entries over a range, so they must not show an
    // entry that was just edited or deleted.
    queryClient.invalidateQueries({
      queryKey: foodEntriesRangeRootQueryKey,
      refetchType: 'all',
    })
  );
  return Promise.allSettled(pending).then(() => undefined);
}
