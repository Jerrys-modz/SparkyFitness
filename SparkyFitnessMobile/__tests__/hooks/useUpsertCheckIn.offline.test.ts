import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUpsertCheckIn } from '../../src/hooks/useUpsertCheckIn';
import { upsertCheckIn } from '../../src/services/api/measurementsApi';
import { isQueuedWrite } from '../../src/services/offlineQueue/queueRunner';
import { getActiveServerConfig } from '../../src/services/storage';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { TimeoutError } from '../../src/utils/concurrency';
import { measurementsQueryKey } from '../../src/hooks/queryKeys';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

const initialStore = useOfflineQueueStore.getState();

describe('useUpsertCheckIn with the offline queue', () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useOfflineQueueStore.setState({
      ...initialStore,
      items: [],
      attention: [],
      accounts: {},
      settling: [],
      deviceOffline: false,
    });
    jest.mocked(getActiveServerConfig).mockResolvedValue({
      id: 'config-1',
      url: 'https://example.test',
      apiKey: '',
    });
    queryClient = createTestQueryClient();
  });

  afterEach(() => queryClient.clear());

  const render = () =>
    renderHook(() => useUpsertCheckIn(), {
      wrapper: createQueryWrapper(queryClient),
    });

  test('saves normally when the server answers', async () => {
    const saved = { entry_date: '2026-10-17', weight: 80 };
    jest.mocked(upsertCheckIn).mockResolvedValue(saved);
    const { result } = render();

    await act(async () => {
      await result.current.mutateAsync({ entryDate: '2026-10-17', weight: 80 });
    });

    expect(
      queryClient.getQueryData(measurementsQueryKey('2026-10-17'))
    ).toEqual(saved);
    expect(useOfflineQueueStore.getState().items).toEqual([]);
    expect(upsertCheckIn).toHaveBeenCalledWith(
      { entryDate: '2026-10-17', weight: 80 },
      { timeoutMs: expect.any(Number) }
    );
  });

  test('queues a weight the server could not be reached for and says so', async () => {
    jest
      .mocked(upsertCheckIn)
      .mockRejectedValue(new TimeoutError('Request', 10));
    const { result } = render();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        entryDate: '2026-10-17',
        weight: 79.5,
      });
    });

    expect(isQueuedWrite(outcome)).toBe(true);
    expect(useOfflineQueueStore.getState().items).toHaveLength(1);
    expect(useOfflineQueueStore.getState().items[0]).toMatchObject({
      kind: 'check_in',
      entryDate: '2026-10-17',
      payload: { entryDate: '2026-10-17', weight: 79.5 },
    });
    // Nothing is stored as if the server had it.
    expect(
      queryClient.getQueryData(measurementsQueryKey('2026-10-17'))
    ).toBeUndefined();
  });

  test('queues without trying when the device is offline', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const { result } = render();

    await act(async () => {
      await result.current.mutateAsync({ entryDate: '2026-10-17', weight: 80 });
    });

    await waitFor(() =>
      expect(useOfflineQueueStore.getState().items).toHaveLength(1)
    );
    expect(upsertCheckIn).not.toHaveBeenCalled();
  });
});
