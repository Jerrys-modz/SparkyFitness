import { apiFetch } from '../../../src/services/api/apiClient';
import {
  ADMIN_USERS_PAGE_SIZE,
  deleteAdminUser,
  fetchAdminGlobalSettings,
  fetchAdminUsers,
  saveAdminGlobalSettings,
  updateAdminUserStatus,
} from '../../../src/services/api/adminApi';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const request = jest.mocked(apiFetch);
const config = {
  id: 'owner',
  url: 'https://example.test',
  apiKey: 'synthetic-test-key',
};

beforeEach(() => jest.resetAllMocks());

it('keeps settings fields it does not name, so a save sends them back', async () => {
  request.mockResolvedValue({
    is_mfa_mandatory: true,
    enable_challenges: null,
    future_switch: 'kept',
  });

  const settings = await fetchAdminGlobalSettings();

  expect(settings).toEqual({
    is_mfa_mandatory: true,
    enable_challenges: null,
    future_switch: 'kept',
  });
});

it('saves the whole settings object to the server it was changed for', async () => {
  const settings = { is_mfa_mandatory: false, public_api_docs: true };
  request.mockResolvedValue(settings);

  await saveAdminGlobalSettings(settings, config);

  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: '/api/admin/global-settings',
      method: 'PUT',
      body: settings,
      serverConfig: config,
    })
  );
});

it('asks for a full page of users, not the server default of 10', async () => {
  request.mockResolvedValue([]);

  await fetchAdminUsers('a b');

  expect(request.mock.calls[0][0].endpoint).toBe(
    `/api/admin/users?searchTerm=a+b&limit=${ADMIN_USERS_PAGE_SIZE}&offset=0`
  );
});

it('escapes the user id in user paths', async () => {
  request.mockResolvedValue(undefined);

  await updateAdminUserStatus('a/b', false, config);
  await deleteAdminUser('a/b', config);

  expect(request.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      endpoint: '/api/admin/users/a%2Fb/status',
      method: 'PUT',
      body: { isActive: false },
      serverConfig: config,
    })
  );
  expect(request.mock.calls[1][0]).toEqual(
    expect.objectContaining({
      endpoint: '/api/admin/users/a%2Fb',
      method: 'DELETE',
    })
  );
});
