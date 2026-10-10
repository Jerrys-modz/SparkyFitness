import { File } from 'expo-file-system';
import { apiFetch, normalizeUrl } from './apiClient';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { ApiError } from './errors';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
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

export type ProfileUpdate = Partial<
  Pick<UserProfile, 'full_name' | 'date_of_birth'>
>;

/**
 * Updates the profile. The server COALESCEs each column, so omitted fields keep
 * their current values (and a field cannot be cleared by sending null).
 */
export const updateProfile = async (
  data: ProfileUpdate
): Promise<UserProfile> => {
  const response = await apiFetch<{ profile: UserProfile }>({
    endpoint: '/api/identity/profiles',
    serviceName: 'Profile API',
    operation: 'update profile',
    method: 'PUT',
    body: data,
  });
  return response.profile;
};

/**
 * Uploads a new avatar from a local image URI and returns its server path
 * (e.g. `/uploads/avatars/<file>`).
 */
export const uploadAvatar = async (uri: string): Promise<string> => {
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    throw new Error(
      'HTTPS is required for server connections. Please update your server URL in Settings.'
    );
  }

  const form = new FormData();
  // expo/fetch rejects React Native's {uri, name, type} parts; an
  // expo-file-system File implements Blob and serializes correctly.
  form.append('avatar', new File(uri));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}/api/identity/profiles/avatar`,
      {
        method: 'POST',
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
          // No Content-Type: multer needs the generated boundary.
        },
        body: form,
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch (err) {
    addLog('[Profile API] upload avatar failed without a response', 'ERROR', [
      String(err),
    ]);
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Profile API] Failed to upload avatar', 'ERROR', [text]);
    throw new ApiError(
      `Server error: ${response.status} - ${text}`,
      response.status,
      text
    );
  }

  const body = (await response.json()) as { avatar_url: string };
  return body.avatar_url;
};

/** The signed-in account's email, used to send a password-reset link. */
export const fetchAccountEmail = async (): Promise<string | null> => {
  const user = await apiFetch<{ authenticatedUserEmail?: string | null }>({
    endpoint: '/api/identity/user',
    serviceName: 'Profile API',
    operation: 'fetch account',
  });
  return user.authenticatedUserEmail ?? null;
};
