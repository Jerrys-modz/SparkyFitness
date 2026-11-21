import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AdminGlobalSettings } from '@workspace/shared';
import {
  useAdminGlobalSettings,
  useIsAdmin,
  useUpdateAdminGlobalSetting,
} from '../../src/hooks/useAdmin';
import { adminGlobalSettingsQueryKey } from '../../src/hooks/queryKeys';
import {
  fetchAdminGlobalSettings,
  fetchSignedInIdentity,
  saveAdminGlobalSettings,
} from '../../src/services/api/adminApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  showServerOnScreen,
  testServer,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/adminApi', () => ({
  fetchAdminGlobalSettings: jest.fn(),
  fetchSignedInIdentity: jest.fn(),
  saveAdminGlobalSettings: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

let queryClient: QueryClient;

beforeEach(() => {
  jest.resetAllMocks();
  queryClient = createTestQueryClient();
  showServerOnScreen(queryClient);
});

describe('useIsAdmin', () => {
  it('is true only once the server says the account is an admin', async () => {
    jest
      .mocked(fetchSignedInIdentity)
      .mockResolvedValue({ authenticatedUserId: 'u1', role: 'admin' });
    const { result } = renderHook(() => useIsAdmin(true), {
      wrapper: createQueryWrapper(queryClient),
    });
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false for a user', async () => {
    jest
      .mocked(fetchSignedInIdentity)
      .mockResolvedValue({ authenticatedUserId: 'u1', role: 'user' });
    const { result } = renderHook(() => useIsAdmin(true), {
      wrapper: createQueryWrapper(queryClient),
    });
    await settle();
    expect(result.current).toBe(false);
  });

  it('asks nothing while not connected', async () => {
    renderHook(() => useIsAdmin(false), {
      wrapper: createQueryWrapper(queryClient),
    });
    await settle();
    expect(fetchSignedInIdentity).not.toHaveBeenCalled();
  });
});

describe('useUpdateAdminGlobalSetting', () => {
  const loaded: AdminGlobalSettings = {
    is_mfa_mandatory: true,
    enable_challenges: true,
    public_api_docs: false,
  };

  it('sends the settings read with only the changed field altered', async () => {
    jest.mocked(fetchAdminGlobalSettings).mockResolvedValue(loaded);
    jest
      .mocked(saveAdminGlobalSettings)
      .mockImplementation(async (settings) => settings);
    const { result } = renderHook(
      () => ({
        read: useAdminGlobalSettings(),
        write: useUpdateAdminGlobalSetting(),
      }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.read.data).toEqual(loaded));

    act(() => result.current.write.setSetting('enable_challenges', false));
    await settle();

    expect(saveAdminGlobalSettings).toHaveBeenCalledWith(
      { ...loaded, enable_challenges: false },
      testServer
    );
    expect(queryClient.getQueryData(adminGlobalSettingsQueryKey)).toEqual({
      ...loaded,
      enable_challenges: false,
    });
  });

  it('builds a second quick change on the first', async () => {
    jest.mocked(fetchAdminGlobalSettings).mockResolvedValue(loaded);
    jest
      .mocked(saveAdminGlobalSettings)
      .mockImplementation(async (settings) => settings);
    const { result } = renderHook(
      () => ({
        read: useAdminGlobalSettings(),
        write: useUpdateAdminGlobalSetting(),
      }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.read.data).toEqual(loaded));

    act(() => {
      result.current.write.setSetting('enable_challenges', false);
      result.current.write.setSetting('public_api_docs', true);
    });
    await settle();

    expect(jest.mocked(saveAdminGlobalSettings).mock.calls[1][0]).toEqual({
      ...loaded,
      enable_challenges: false,
      public_api_docs: true,
    });
  });

  it('reads the settings again when a save fails', async () => {
    jest.mocked(fetchAdminGlobalSettings).mockResolvedValue(loaded);
    jest
      .mocked(saveAdminGlobalSettings)
      .mockRejectedValue(new Error('offline'));
    const { result } = renderHook(
      () => ({
        read: useAdminGlobalSettings(),
        write: useUpdateAdminGlobalSetting(),
      }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.read.data).toEqual(loaded));

    act(() => result.current.write.setSetting('enable_challenges', false));
    await waitFor(() =>
      expect(fetchAdminGlobalSettings).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(result.current.read.data).toEqual(loaded));
  });
});
