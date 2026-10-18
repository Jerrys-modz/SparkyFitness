import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWaterIntakeMutation } from '../../src/hooks/useWaterIntakeMutation';
import {
  changeWaterIntake,
  fetchWaterContainers,
} from '../../src/services/api/measurementsApi';
import { ApiError } from '../../src/services/api/errors';
import { getActiveServerConfig } from '../../src/services/storage';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { TimeoutError } from '../../src/utils/concurrency';
import type { DailySummaryRawData } from '../../src/hooks/useDailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterContainers: jest.fn(),
  changeWaterIntake: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../src/utils/ids', () => ({ newUuid: () => 'drink-uuid-1' }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: () => true, navigate: jest.fn() },
}));

const mockChange = jest.mocked(changeWaterIntake);
const container = {
  id: 1,
  name: 'Glass',
  volume: 250,
  unit: 'ml',
  is_primary: true,
  servings_per_container: 1,
};
const DATE = '2026-10-17';
const raw = (waterMl: number): DailySummaryRawData =>
  ({
    goals: {},
    foodEntries: [],
    exerciseEntries: [],
    waterIntake: { water_ml: waterMl },
  }) as unknown as DailySummaryRawData;
const initialStore = useOfflineQueueStore.getState();

describe('useWaterIntakeMutation with the offline queue', () => {
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
    jest.mocked(fetchWaterContainers).mockResolvedValue([container]);
    queryClient = createTestQueryClient();
    queryClient.setQueryData(dailySummaryQueryKey(DATE), raw(500));
  });

  afterEach(() => queryClient.clear());

  const setup = async () => {
    const hook = renderHook(() => useWaterIntakeMutation({ date: DATE }), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    return hook;
  };

  const cachedWater = () =>
    queryClient.getQueryData<DailySummaryRawData>(dailySummaryQueryKey(DATE))
      ?.waterIntake.water_ml;

  test('sends a press with a client id so a replay cannot count twice', async () => {
    mockChange.mockResolvedValue({ water_ml: 750 });
    const { result } = await setup();

    act(() => result.current.increment());

    await waitFor(() => expect(cachedWater()).toBe(750));
    expect(mockChange).toHaveBeenCalledWith({
      entryDate: DATE,
      changeDrinks: 1,
      containerId: 1,
      clientId: 'drink-uuid-1',
      timeoutMs: expect.any(Number),
    });
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('queues a press that could not reach the server and leaves the cache alone', async () => {
    mockChange.mockRejectedValue(new TimeoutError('Request', 10));
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await setup();

    act(() => result.current.increment());

    await waitFor(() =>
      expect(useOfflineQueueStore.getState().items).toHaveLength(1)
    );
    expect(useOfflineQueueStore.getState().items[0]).toMatchObject({
      id: 'drink-uuid-1',
      kind: 'water',
      entryDate: DATE,
      payload: { containerId: 1 },
      previewMl: 250,
    });
    // The optimistic +250 is taken back: the overlay shows the queued drink,
    // and counting it in the cache as well would show it twice.
    await waitFor(() => expect(cachedWater()).toBe(500));
    expect(spy).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  test('queues straight away when the device is offline', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const { result } = await setup();

    act(() => result.current.increment());

    await waitFor(() =>
      expect(useOfflineQueueStore.getState().items).toHaveLength(1)
    );
    expect(mockChange).not.toHaveBeenCalled();
  });

  test('refuses a removal offline and restores the total', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const { result } = await setup();

    act(() => result.current.decrement());

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'This needs a connection' })
      )
    );
    expect(cachedWater()).toBe(500);
    expect(mockChange).not.toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('a rejected press is reported, not queued', async () => {
    mockChange.mockRejectedValue(new ApiError('Server error: 400', 400));
    const { result } = await setup();

    act(() => result.current.increment());

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('queues a quick-add drink without guessing its volume when it is linked to a food', async () => {
    jest.mocked(fetchWaterContainers).mockResolvedValue([
      container,
      {
        id: 7,
        name: 'Latte',
        volume: 0,
        unit: 'ml',
        is_primary: false,
        is_quick_add: true,
        servings_per_container: 1,
        linked_food_id: 'food-9',
      },
    ] as never);
    useOfflineQueueStore.setState({ deviceOffline: true });
    const { result } = await setup();
    await waitFor(() => expect(result.current.quickAddPresets).toHaveLength(1));

    act(() => result.current.logPreset(7));

    await waitFor(() =>
      expect(useOfflineQueueStore.getState().items).toHaveLength(1)
    );
    expect(useOfflineQueueStore.getState().items[0]).toMatchObject({
      kind: 'water',
      payload: { containerId: 7 },
      previewMl: null,
    });
  });
});
