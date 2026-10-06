import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDailyGoals, saveDailyGoals } from '../services/api/goalsApi';
import type { DailyGoals } from '../types/goals';
import { dailySummaryRootQueryKey, goalsQueryKey } from './queryKeys';

export function useGoalsQuery(date: string, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: goalsQueryKey(date),
    queryFn: () => fetchDailyGoals(date),
    enabled,
  });
  return {
    goals: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useSaveGoalsMutation() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({
      date,
      goals,
      cascade,
    }: {
      date: string;
      goals: DailyGoals;
      cascade: boolean;
    }) => saveDailyGoals(date, goals, cascade),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goalsRange'] });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    },
  });
  return {
    saveGoals: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
