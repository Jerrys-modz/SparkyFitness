import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGoalWeightPlan,
  getOnboardingStatus,
  resetOnboardingStatus,
  setTargetBodyFat,
  setTargetWeight,
  skipOnboarding,
  submitOnboardingData,
} from '@/api/Onboarding/onboarding';
import { onboardingKeys } from '@/api/keys/onboarding';
import { useTranslation } from 'react-i18next';
import { userKeys } from '@/api/keys/admin';
import { OnboardingData } from '@/types/onboarding';

export const useOnboardingStatus = (enabled: boolean) => {
  return useQuery({
    queryKey: onboardingKeys.status(),
    queryFn: getOnboardingStatus,
    enabled: enabled,
    staleTime: Infinity,
  });
};

export const useSubmitOnboarding = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: OnboardingData) => submitOnboardingData(data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: onboardingKeys.status(),
      });
    },
    meta: {
      errorMessage: t(
        'onboarding.submissionFailed',
        'Could not save your plan. Please try again.'
      ),
      successMessage: t(
        'onboarding.planReady',
        'Your personalized plan is ready to go.'
      ),
    },
  });
};

export const useResetOnboarding = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: resetOnboardingStatus,
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: onboardingKeys.status(),
      });
    },
    meta: {
      errorMessage: t(
        'goals.goalsSettings.errorResettingOnboarding',
        'Failed to reset onboarding status.'
      ),
      successMessage: t(
        'goals.goalsSettings.resetOnboardingSuccess',
        'Onboarding status has been reset.'
      ),
    },
  });
};

export const useSkipOnboarding = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: skipOnboarding,
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: onboardingKeys.status(),
      });
    },
    meta: {
      errorMessage: t(
        'onboarding.skipFailed',
        'Could not skip onboarding. Please try again.'
      ),
    },
  });
};

export interface SetTargetWeightInput {
  targetWeightKg: number | null;
  /** YYYY-MM-DD, null to clear, or omitted to keep the saved date. */
  targetDate?: string | null;
}

export const useSetTargetWeight = (userId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ targetWeightKg, targetDate }: SetTargetWeightInput) =>
      setTargetWeight(targetWeightKg, targetDate),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.profile(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: onboardingKeys.goalWeightPlan(),
        }),
      ]);
    },
    meta: {
      errorMessage: t(
        'goals.goalsSettings.goalWeightSaveFailed',
        'Failed to save goal weight.'
      ),
      successMessage: t(
        'goals.goalsSettings.goalWeightSaved',
        'Goal weight saved.'
      ),
    },
  });
};

/** The goal weight plan; `enabled` is false until a goal weight is saved. */
export const useGoalWeightPlan = (enabled: boolean) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: onboardingKeys.goalWeightPlan(),
    queryFn: getGoalWeightPlan,
    enabled,
    meta: {
      errorMessage: t(
        'goals.goalsSettings.goalWeightPlanLoadFailed',
        'Failed to load the goal weight plan.'
      ),
    },
  });
};

export const useSetTargetBodyFat = (userId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (targetBodyFatPercentage: number | null) =>
      setTargetBodyFat(targetBodyFatPercentage),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: userKeys.profile(userId),
      });
    },
    meta: {
      errorMessage: t(
        'goals.goalsSettings.bodyFatGoalSaveFailed',
        'Failed to save body fat goal.'
      ),
      successMessage: t(
        'goals.goalsSettings.bodyFatGoalSaved',
        'Body fat goal saved.'
      ),
    },
  });
};

/** Refreshes the goal weight plan, e.g. after the calorie goal changes. */
export const useRefreshGoalWeightPlan = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: onboardingKeys.goalWeightPlan(),
    });
};
