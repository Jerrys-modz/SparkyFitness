import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchGoalWeightPlan,
  fetchProfile,
  saveTargetWeight,
} from '../services/api/profileApi';
import { goalWeightPlanQueryKey, profileQueryKey } from './queryKeys';

export function useProfile() {
  const query = useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    staleTime: 1000 * 60 * 30, // 30 minutes - profile rarely changes
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface SaveTargetWeightInput {
  targetWeightKg: number | null;
  /** YYYY-MM-DD, null to remove the date, or omitted to keep it. */
  targetDate?: string | null;
}

/** Saves or clears the goal weight (kg) and its date, and refreshes the profile, charts and plan. */
export function useSetTargetWeight() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ targetWeightKg, targetDate }: SaveTargetWeightInput) =>
      saveTargetWeight(targetWeightKg, targetDate),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileQueryKey }),
        queryClient.invalidateQueries({ queryKey: goalWeightPlanQueryKey }),
      ]),
  });

  return {
    saveTargetWeight: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/** The goal weight plan; off until a goal weight is saved. */
export function useGoalWeightPlan(enabled: boolean) {
  const query = useQuery({
    queryKey: goalWeightPlanQueryKey,
    queryFn: fetchGoalWeightPlan,
    enabled,
  });
  return { plan: query.data, isLoading: query.isLoading };
}
