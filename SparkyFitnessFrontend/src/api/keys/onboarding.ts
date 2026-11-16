export const onboardingKeys = {
  all: ['onboarding'] as const,
  status: () => [...onboardingKeys.all, 'status'] as const,
  goalWeightPlan: () => [...onboardingKeys.all, 'goalWeightPlan'] as const,
  startWeight: (userId?: string | null) =>
    [...onboardingKeys.all, 'startWeight', userId] as const,
};
