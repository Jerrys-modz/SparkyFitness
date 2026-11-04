import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchChronotype,
  fetchEnergyCurve,
  fetchSleepBaselineStats,
  fetchSleepDataSufficiency,
  fetchSleepDebt,
  recalculateSleepBaseline,
} from '../services/api/sleepScienceApi';
import {
  chronotypeQueryKey,
  energyCurveQueryKey,
  sleepBaselineQueryKey,
  sleepDataSufficiencyQueryKey,
  sleepDebtQueryKey,
  sleepScienceQueryKeyRoot,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useSleepDebt() {
  const query = useQuery({
    queryKey: sleepDebtQueryKey,
    queryFn: fetchSleepDebt,
  });
  useRefetchOnFocus(query.refetch);
  return query;
}

export function useChronotype() {
  return useQuery({ queryKey: chronotypeQueryKey, queryFn: fetchChronotype });
}

/** Refetched on focus: "now" and the next peak or dip move through the day. */
export function useEnergyCurve() {
  const query = useQuery({
    queryKey: energyCurveQueryKey,
    queryFn: fetchEnergyCurve,
  });
  useRefetchOnFocus(query.refetch);
  return query;
}

export function useSleepBaseline() {
  return useQuery({
    queryKey: sleepBaselineQueryKey,
    queryFn: fetchSleepBaselineStats,
  });
}

export function useSleepDataSufficiency() {
  return useQuery({
    queryKey: sleepDataSufficiencyQueryKey,
    queryFn: fetchSleepDataSufficiency,
  });
}

/**
 * A new baseline changes every sleep science figure (the debt is measured
 * against it), so success refreshes the whole family.
 */
export function useRecalculateSleepBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recalculateSleepBaseline,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sleepScienceQueryKeyRoot }),
  });
}
