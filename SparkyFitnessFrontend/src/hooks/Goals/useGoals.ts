import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { goalKeys } from '@/api/keys/goals';

import {
  acceptCoachingCheckIn,
  loadGoals,
  saveCoachingSettings,
  saveGoals,
} from '@/api/Goals/goals';
import { reportKeys } from '@/api/keys/reports';
import { useDailyProgressInvalidation } from '@/hooks/useInvalidateKeys';
import type { UpdateCoachingSettingsBody } from '@workspace/shared';
import {
  createGoalPreset,
  deleteGoalPreset,
  getGoalPresets,
  updateGoalPreset,
} from '@/api/Goals/goals';
import {
  createWeeklyGoalPlan,
  deleteWeeklyGoalPlan,
  getWeeklyGoalPlans,
  updateWeeklyGoalPlan,
} from '@/api/Goals/goals';
import type { ExpandedGoals, GoalPreset, WeeklyGoalPlan } from '@/types/goals';
import { DEFAULT_GOALS } from '@/constants/goals';

import i18n from 'i18next';
// --- DAILY GOALS ---

export const useDailyGoals = (date: string) => {
  return useQuery<ExpandedGoals>({
    queryKey: goalKeys.daily.byDate(date),
    queryFn: async () => {
      const data = await loadGoals(date);
      return (data as ExpandedGoals) || DEFAULT_GOALS;
    },
    placeholderData: (previousData) => previousData,
  });
};

export const useDailyGoalsRange = (
  startDate: string,
  endDate: string,
  enabled: boolean = true,
  adjust: boolean = false // Reports use raw stored goals — stable, never jumps on settings change
) => {
  return useQuery<Record<string, ExpandedGoals>>({
    queryKey: goalKeys.daily.byDate(startDate, endDate, adjust),
    queryFn: async () => {
      const data = await loadGoals(startDate, endDate, adjust);
      return (data as Record<string, ExpandedGoals>) || {};
    },
    placeholderData: (previousData) => previousData,
    enabled: enabled,
  });
};

export const useGoalPresets = () => {
  return useQuery({
    queryKey: goalKeys.presets.all(),
    queryFn: getGoalPresets,
    meta: {
      errorMessage: i18n.t(
        'hooks.useGoals.failedToLoadGoalPresets',
        'Failed to load goal presets.'
      ),
    },
  });
};

export const useSaveGoalsMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      date,
      goals,
      cascade,
    }: {
      date: string;
      goals: ExpandedGoals;
      cascade: boolean;
    }) => saveGoals(date, goals, cascade),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.daily.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.goalsUpdatedSuccess',
        'Goals updated and will apply for the next 6 months (or until your next future goal)'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorSavingGoals',
        'An unexpected error occurred while saving goals'
      ),
    },
  });
};

// --- GOAL PRESETS ---

export const useCreatePresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (presetData: GoalPreset) => createGoalPreset(presetData),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.presets.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.presetCreatedSuccess',
        'Goal preset created successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorSavingPreset',
        'Failed to save goal preset.'
      ),
    },
  });
};

export const useUpdatePresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: GoalPreset }) =>
      updateGoalPreset(id, data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.presets.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.presetUpdatedSuccess',
        'Goal preset updated successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorSavingPreset',
        'Failed to save goal preset.'
      ),
    },
  });
};

export const useDeletePresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => deleteGoalPreset(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.presets.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.presetDeletedSuccess',
        'Goal preset deleted successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorDeletingPreset',
        'Failed to delete goal preset.'
      ),
    },
  });
};

// --- WEEKLY GOAL PLANS ---

export const useWeeklyGoalPlans = () => {
  return useQuery({
    queryKey: goalKeys.plans.all(),
    queryFn: getWeeklyGoalPlans,
    meta: {
      errorMessage: i18n.t(
        'hooks.useGoals.failedToLoadWeeklyPlans',
        'Failed to load weekly plans.'
      ),
    },
  });
};
export const useCreateWeeklyPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (planData: WeeklyGoalPlan) => createWeeklyGoalPlan(planData),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.plans.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.weeklyPlanCreatedSuccess',
        'Weekly plan created successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorSavingWeeklyPlan',
        'Failed to save weekly plan.'
      ),
    },
  });
};

export const useUpdateWeeklyPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: WeeklyGoalPlan }) =>
      updateWeeklyGoalPlan(id, data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.plans.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.weeklyPlanUpdatedSuccess',
        'Weekly plan updated successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorSavingWeeklyPlan',
        'Failed to save weekly plan.'
      ),
    },
  });
};

export const useDeleteWeeklyPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => deleteWeeklyGoalPlan(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: goalKeys.plans.all(),
      });
    },
    meta: {
      successMessage: t(
        'goals.goalsSettings.weeklyPlanDeletedSuccess',
        'Weekly plan deleted successfully.'
      ),
      errorMessage: t(
        'goals.goalsSettings.errorDeletingWeeklyPlan',
        'Failed to delete weekly plan.'
      ),
    },
  });
};

export const useSaveCoachingSettingsMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (body: UpdateCoachingSettingsBody) =>
      saveCoachingSettings(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    meta: {
      errorMessage: t(
        'coaching.settingsFailed',
        'Could not save your coaching goal.'
      ),
    },
  });
};

/** Accepting rewrites the goal timeline, so every cache that shows a goal is refreshed. */
export const useAcceptCoachingCheckInMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const invalidateDailyProgress = useDailyProgressInvalidation();

  return useMutation({
    mutationFn: (calories: number) => acceptCoachingCheckIn(calories),
    onSuccess: () => {
      invalidateDailyProgress();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: goalKeys.all }),
        queryClient.invalidateQueries({ queryKey: reportKeys.all }),
      ]);
    },
    // A refused accept means the check-in moved on; show the new one.
    onError: () => queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    meta: {
      successMessage: t('coaching.accepted', 'Targets updated from today.'),
    },
  });
};
