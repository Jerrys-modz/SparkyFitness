import { apiFetch } from './apiClient';
import type {
  GoalWeightPlanResponse,
  SetGoalWeightResponse,
} from '@workspace/shared';
import { UserProfile } from '../../types/profile';

/**
 * Fetches the user's profile.
 */
export const fetchProfile = async (): Promise<UserProfile> => {
  return apiFetch<UserProfile>({
    endpoint: '/api/identity/profiles',
    serviceName: 'Profile API',
    operation: 'fetch profile',
  });
};

/**
 * Sets the goal weight (kilograms), or clears it (and its date) with null.
 * `targetDate` is YYYY-MM-DD, null to remove the date, or omitted to keep it.
 */
export const saveTargetWeight = async (
  targetWeightKg: number | null,
  targetDate?: string | null
): Promise<SetGoalWeightResponse> => {
  return apiFetch<SetGoalWeightResponse>({
    endpoint: '/api/onboarding/target-weight',
    serviceName: 'Profile API',
    operation: 'save goal weight',
    method: 'PUT',
    body:
      targetDate === undefined
        ? { targetWeight: targetWeightKg }
        : { targetWeight: targetWeightKg, targetDate },
  });
};

/** Where the goal weight and its target date stand against the calorie goal. */
export const fetchGoalWeightPlan =
  async (): Promise<GoalWeightPlanResponse> => {
    return apiFetch<GoalWeightPlanResponse>({
      endpoint: '/api/onboarding/target-weight/plan',
      serviceName: 'Profile API',
      operation: 'fetch goal weight plan',
    });
  };

/**
 * Sets or clears the body fat % goal (`PUT /api/onboarding/target-body-fat`,
 * owner-only). The server checks the range again.
 */
export const updateTargetBodyFat = async (
  targetBodyFatPercentage: number | null
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/onboarding/target-body-fat',
    serviceName: 'Profile API',
    operation: 'save body fat goal',
    method: 'PUT',
    body: { targetBodyFatPercentage },
  });
};
