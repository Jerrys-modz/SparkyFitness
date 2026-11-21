import { apiFetch } from './apiClient';
import type { ServerConfig } from '../storage';
import type {
  OnboardingActivityLevel,
  OnboardingPrimaryGoal,
} from '@workspace/shared';

export interface OnboardingStatus {
  onboardingComplete: boolean;
  onboardingSkipped: boolean;
}

/** The answers the server keeps in `onboarding_data`; weights in kg, height in cm. */
export interface OnboardingSubmission {
  sex: 'male' | 'female';
  primaryGoal: Exclude<OnboardingPrimaryGoal, ''>;
  currentWeight: number;
  height: number;
  /** YYYY-MM-DD */
  birthDate: string;
  bodyFatRange?: string;
  targetWeight: number;
  mealsPerDay: number;
  activityLevel: Exclude<OnboardingActivityLevel, ''>;
  addBurnedCalories: boolean;
}

/** Whether the account has finished or skipped goal setup. */
export const fetchOnboardingStatus = (
  serverConfig?: ServerConfig
): Promise<OnboardingStatus> =>
  apiFetch<OnboardingStatus>({
    endpoint: '/api/onboarding/status',
    serviceName: 'Onboarding API',
    operation: 'fetch onboarding status',
    serverConfig,
  });

/** Saves the answers and marks goal setup as finished. */
export const submitOnboarding = async (
  data: OnboardingSubmission,
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/onboarding',
    serviceName: 'Onboarding API',
    operation: 'submit onboarding',
    method: 'POST',
    body: data,
    serverConfig,
  });
};

/** Marks goal setup as skipped, so it is not offered again after sign-in. */
export const skipOnboarding = async (
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/onboarding/skip',
    serviceName: 'Onboarding API',
    operation: 'skip onboarding',
    method: 'POST',
    serverConfig,
  });
};
