import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOfflineQueueSync } from '../../src/hooks/useOfflineQueueSync';
import { useOfflineQueueStatus } from '../../src/hooks/useOfflineQueueStatus';
import { drainQueue } from '../../src/services/offlineQueue/queueRunner';
import { startNetworkMonitor } from '../../src/services/offlineQueue/networkMonitor';
import {
  restoreQueryCache,
  startQueryCachePersistence,
} from '../../src/services/queryCachePersistence';
import { getActiveServerConfig } from '../../src/services/storage';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { useServerConnection } from '../../src/hooks/useServerConnection';
import { foodItem } from '../helpers/offlineQueue';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';
import { serverConnectionQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: jest.fn(),
}));
jest.mock('../../src/services/offlineQueue/queueRunner', () => ({
  drainQueue: jest
    .fn()
    .mockResolvedValue({ sent: 0, needsAttention: 0, stopped: 'done' }),
}));
jest.mock('../../src/services/offlineQueue/networkMonitor', () => ({
  startNetworkMonitor: jest.fn(() => jest.fn()),
}));
jest.mock('../../src/services/queryCachePersistence', () => ({
  restoreQueryCache: jest.fn().mockResolvedValue(true),
  startQueryCachePersistence: jest.fn(() => jest.fn()),
}));

const initialStore = useOfflineQueueStore.getState();
const connection = (isConnected: boolean, isLoading = false) =>
  jest.mocked(useServerConnection).mockReturnValue({
    isConnected,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  });

beforeEach(async () => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  await AsyncStorage.clear();
  useOfflineQueueStore.setState({
    ...initialStore,
    items: [],
    attention: [],
    accounts: {},
    loaded: false,
    activeConfigId: null,
    deviceOffline: false,
    draining: false,
  });
  jest.mocked(getActiveServerConfig).mockResolvedValue({
    id: 'config-1',
    url: 'https://example.test',
    apiKey: '',
  });
  connection(false);
});

let queryClient: QueryClient;
const render = () =>
  renderHook(() => useOfflineQueueSync(), {
    wrapper: createQueryWrapper(queryClient),
  });

describe('useOfflineQueueSync', () => {
  it('loads the stored queue and cache for the active server, then drains', async () => {
    await useOfflineQueueStore
      .getState()
      .commit((s) => ({ ...s, items: [foodItem('stored')] }));
    useOfflineQueueStore.setState({ items: [], loaded: false });

    render();

    await waitFor(() => expect(drainQueue).toHaveBeenCalled());
    const state = useOfflineQueueStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.activeConfigId).toBe('config-1');
    expect(state.items.map((i) => i.id)).toEqual(['stored']);
    expect(restoreQueryCache).toHaveBeenCalledWith(
      expect.anything(),
      'config-1'
    );
    // Saving starts only after the restore, or the stored copy would be
    // overwritten by an empty cache.
    expect(startQueryCachePersistence).toHaveBeenCalled();
    const restoreOrder =
      jest.mocked(restoreQueryCache).mock.invocationCallOrder[0];
    const persistOrder = jest.mocked(startQueryCachePersistence).mock
      .invocationCallOrder[0];
    expect(restoreOrder).toBeLessThan(persistOrder);
  });

  it('does not restore a cache when no server is configured', async () => {
    jest.mocked(getActiveServerConfig).mockResolvedValue(null);
    render();
    await waitFor(() => expect(startQueryCachePersistence).toHaveBeenCalled());
    expect(restoreQueryCache).not.toHaveBeenCalled();
  });

  it('drains when the server starts answering, once per recovery', async () => {
    render();
    await waitFor(() => expect(startQueryCachePersistence).toHaveBeenCalled());
    jest.mocked(drainQueue).mockClear();

    act(() => queryClient.setQueryData(serverConnectionQueryKey, false));
    expect(drainQueue).not.toHaveBeenCalled();

    act(() => queryClient.setQueryData(serverConnectionQueryKey, true));
    expect(drainQueue).toHaveBeenCalledTimes(1);

    // Still reachable on the next check: nothing new to announce.
    act(() => queryClient.setQueryData(serverConnectionQueryKey, true));
    expect(drainQueue).toHaveBeenCalledTimes(1);

    act(() => queryClient.setQueryData(serverConnectionQueryKey, false));
    act(() => queryClient.setQueryData(serverConnectionQueryKey, true));
    expect(drainQueue).toHaveBeenCalledTimes(2);
  });

  it('drains when the device regains a connection and when the app returns', async () => {
    let regained: () => void = () => undefined;
    jest.mocked(startNetworkMonitor).mockImplementation((cb) => {
      regained = cb;
      return jest.fn();
    });
    let appStateListener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      cb: (state: string) => void
    ) => {
      appStateListener = cb;
      return { remove: jest.fn() };
    }) as never);

    render();
    await waitFor(() => expect(startQueryCachePersistence).toHaveBeenCalled());
    jest.mocked(drainQueue).mockClear();

    act(() => regained());
    expect(drainQueue).toHaveBeenCalledTimes(1);

    act(() => appStateListener('background'));
    expect(drainQueue).toHaveBeenCalledTimes(1);
    act(() => appStateListener('active'));
    expect(drainQueue).toHaveBeenCalledTimes(2);
  });

  it('retries waiting entries on a timer and stops when none are left', async () => {
    jest.useFakeTimers();
    try {
      render();
      await act(async () => {
        await Promise.resolve();
      });
      jest.mocked(drainQueue).mockClear();

      await act(async () => {
        await useOfflineQueueStore
          .getState()
          .commit((s) => ({ ...s, items: [foodItem('a')] }));
      });
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(drainQueue).toHaveBeenCalledTimes(1);

      await act(async () => {
        await useOfflineQueueStore
          .getState()
          .commit((s) => ({ ...s, items: [] }));
      });
      act(() => {
        jest.advanceTimersByTime(180_000);
      });
      expect(drainQueue).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cleans up what it started', async () => {
    const stopPersistence = jest.fn();
    const stopNetwork = jest.fn();
    jest.mocked(startQueryCachePersistence).mockReturnValue(stopPersistence);
    jest.mocked(startNetworkMonitor).mockReturnValue(stopNetwork);

    const { unmount } = render();
    await waitFor(() => expect(startQueryCachePersistence).toHaveBeenCalled());
    unmount();

    expect(stopPersistence).toHaveBeenCalled();
    expect(stopNetwork).toHaveBeenCalled();
  });
});

describe('useOfflineQueueStatus', () => {
  const statusOf = () =>
    renderHook(() => useOfflineQueueStatus()).result.current;

  it("counts only the active server's items", () => {
    connection(true);
    useOfflineQueueStore.setState({
      activeConfigId: 'config-1',
      items: [foodItem('a'), { ...foodItem('b'), configId: 'config-2' }],
    });
    expect(statusOf()).toMatchObject({ pendingCount: 1, isOffline: false });
  });

  it('is offline when the server does not answer, but only if one is configured', () => {
    connection(false);
    useOfflineQueueStore.setState({ activeConfigId: 'config-1' });
    expect(statusOf().isOffline).toBe(true);

    useOfflineQueueStore.setState({ activeConfigId: null });
    expect(statusOf().isOffline).toBe(false);
  });

  it('is offline when the device says so, whatever the server check last said', () => {
    connection(true);
    useOfflineQueueStore.setState({
      activeConfigId: 'config-1',
      deviceOffline: true,
    });
    expect(statusOf().isOffline).toBe(true);
  });

  it('waits for the first connection check before calling the server unreachable', () => {
    connection(false, true);
    useOfflineQueueStore.setState({ activeConfigId: 'config-1' });
    expect(statusOf().isOffline).toBe(false);
  });
});
