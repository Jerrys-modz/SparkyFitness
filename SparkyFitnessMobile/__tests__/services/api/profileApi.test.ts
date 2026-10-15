import {
  fetchAccountEmail,
  updateProfile,
} from '../../../src/services/api/profileApi';

const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  normalizeUrl: (url: string) => url,
}));
jest.mock('../../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(() => ({})),
  notifySessionExpired: jest.fn(),
}));
jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(() => ({})),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

describe('profileApi', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('updateProfile PUTs the changed fields and unwraps the profile', async () => {
    const profile = { id: 'u1', full_name: 'Sam', date_of_birth: '1990-02-03' };
    mockApiFetch.mockResolvedValue({ message: 'ok', profile });

    const result = await updateProfile({ full_name: 'Sam' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/identity/profiles',
        method: 'PUT',
        body: { full_name: 'Sam' },
      })
    );
    expect(result).toBe(profile);
  });

  it('fetchAccountEmail returns the authenticated email, or null', async () => {
    mockApiFetch.mockResolvedValueOnce({ authenticatedUserEmail: 'a@b.co' });
    await expect(fetchAccountEmail()).resolves.toBe('a@b.co');

    mockApiFetch.mockResolvedValueOnce({});
    await expect(fetchAccountEmail()).resolves.toBeNull();
  });
});
