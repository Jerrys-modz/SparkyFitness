import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadSparkyDailySummary } from '@/api/Chatbot/assistantService';
import { useAuth } from '@/hooks/useAuth';

// The server keeps a summary for three hours; asking again sooner returns the
// same text.
const DAILY_SUMMARY_STALE_MS = 3 * 60 * 60 * 1000;

/**
 * Sparky's daily summary. Each new summary is a request to the person's AI
 * service, so it loads once per day and only refreshes when asked.
 */
export function useSparkyDailySummary(today: string, enabled: boolean) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['sparkyDailySummary', user?.id, today];

  const query = useQuery({
    queryKey,
    queryFn: () => loadSparkyDailySummary(),
    enabled: enabled && !!user,
    staleTime: DAILY_SUMMARY_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refresh = useMutation({
    mutationFn: () => loadSparkyDailySummary(true),
    onSuccess: (data) => client.setQueryData(queryKey, data),
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
