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
 * The id of the account the server resolves the current credentials to. Used
 * to tell whether queued writes still belong to whoever is signed in.
 */
export const fetchAuthenticatedUserId = async (): Promise<string> => {
  const identity = await apiFetch<{ authenticatedUserId?: string }>({
    endpoint: '/api/identity/user',
    serviceName: 'Profile API',
    operation: 'fetch authenticated user',
  });
  if (!identity?.authenticatedUserId) {
    throw new Error('Server did not return the signed-in user.');
  }
  return identity.authenticatedUserId;
};

/**
 * Sets the goal weight (kilograms), or clears it with null.
 */
export const saveTargetWeight = async (
  targetWeightKg: number | null
): Promise<{ targetWeight: number | null }> => {
  return apiFetch<{ targetWeight: number | null }>({
    endpoint: '/api/onboarding/target-weight',
    serviceName: 'Profile API',
    operation: 'save goal weight',
    method: 'PUT',
    body: { targetWeight: targetWeightKg },
  });
};
