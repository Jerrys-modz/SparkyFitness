import { apiFetch } from './apiClient';
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
