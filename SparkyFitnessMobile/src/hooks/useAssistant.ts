import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssistantDailySummaryResponse,
  FoodAssistantPreference,
} from '@workspace/shared';
import {
  deleteSavedPreference,
  fetchSavedPreferences,
  fetchSparkyDailySummary,
  saveSavedPreference,
} from '../services/api/assistantApi';
import { getTodayDate } from '../utils/dateUtils';
import {
  savedPreferencesQueryKey,
  sparkyDailySummaryQueryKey,
} from './queryKeys';

// The server keeps a summary for three hours; asking again sooner returns the
// same text, so there is nothing to gain from refetching on every focus.
const DAILY_SUMMARY_STALE_MS = 3 * 60 * 60 * 1000;

/**
 * Sparky's daily summary. Each new summary is a request to the person's AI
 * service, so it loads once per day and only refreshes when asked.
 */
export function useSparkyDailySummary(enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = sparkyDailySummaryQueryKey(getTodayDate());

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSparkyDailySummary(),
    enabled,
    staleTime: DAILY_SUMMARY_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refresh = useMutation({
    mutationFn: () => fetchSparkyDailySummary(true),
    onSuccess: (data: AssistantDailySummaryResponse) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError || refresh.isError,
    isRefreshing: refresh.isPending || query.isRefetching,
    refresh: () => {
      // After a failed first load there is nothing to replace yet.
      if (query.isError) void query.refetch();
      else refresh.mutate();
    },
  };
}

/** The preferences the person asked Sparky to remember, with their edits. */
export function useSavedPreferences() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: savedPreferencesQueryKey,
    queryFn: fetchSavedPreferences,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: savedPreferencesQueryKey });
  };

  const save = useMutation({
    mutationFn: (input: {
      key: string;
      value: string;
      expectedVersion: number;
    }) => saveSavedPreference(input.key, input.value, input.expectedVersion),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (preference: FoodAssistantPreference) =>
      deleteSavedPreference(preference),
    onSettled: invalidate,
  });

  return {
    preferences: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save,
    remove,
  };
}
