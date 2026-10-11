import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDailyGoals,
  fetchGoalsRange,
  saveDailyGoals,
} from '../services/api/goalsApi';
import {
  fetchNutrientGoalPreferences,
  saveNutrientGoalPreference,
  type NutrientGoalPreference,
} from '../services/api/nutrientGoalPreferencesApi';
import {
  createGoalPreset,
  deleteGoalPreset,
  fetchGoalPresets,
  updateGoalPreset,
} from '../services/api/goalPresetsApi';
import type { DailyGoals, GoalPreset } from '../types/goals';
import {
  dailySummaryRootQueryKey,
  goalPresetsQueryKey,
  goalsQueryKey,
  goalsRangeQueryKey,
} from './queryKeys';

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

/** Today's goal after adaptive/dynamic adjustments, which differs from the saved row. */
export function useAdjustedCalorieGoal(date: string, enabled: boolean) {
  const query = useQuery({
    queryKey: goalsRangeQueryKey(date, date, true),
    queryFn: () => fetchGoalsRange(date, date, true),
    enabled,
  });
  return query.data?.[date]?.calories;
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

export const nutrientGoalPreferencesQueryKey = [
  'nutrientGoalPreferences',
] as const;

export function useNutrientGoalPreferences({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: nutrientGoalPreferencesQueryKey,
    queryFn: fetchNutrientGoalPreferences,
    enabled,
  });
  return { directions: query.data, isLoading: query.isLoading };
}

export function useSaveNutrientGoalPreferences() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (
      updates: { key: string; preference: NutrientGoalPreference }[]
    ) => {
      for (const { key, preference } of updates) {
        await saveNutrientGoalPreference(key, preference);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: nutrientGoalPreferencesQueryKey,
      });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    },
  });
  return mutation.mutateAsync;
}

export function useGoalPresets({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: goalPresetsQueryKey,
    queryFn: fetchGoalPresets,
    enabled,
  });
  return { presets: query.data ?? [], isLoading: query.isLoading };
}

export function useGoalPresetMutations() {
  const queryClient = useQueryClient();
  const onSettled = () =>
    queryClient.invalidateQueries({ queryKey: goalPresetsQueryKey });
  const create = useMutation({ mutationFn: createGoalPreset, onSettled });
  const update = useMutation({
    mutationFn: ({ id, preset }: { id: string; preset: GoalPreset }) =>
      updateGoalPreset(id, preset),
    onSettled,
  });
  const remove = useMutation({ mutationFn: deleteGoalPreset, onSettled });
  return {
    createPreset: create.mutateAsync,
    updatePreset: update.mutateAsync,
    deletePreset: remove.mutateAsync,
    isPending: create.isPending || update.isPending || remove.isPending,
  };
}
