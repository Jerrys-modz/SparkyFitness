import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { saveFood } from '../../src/services/api/foodsApi';
import { ApiError } from '../../src/services/api/errors';
import { getActiveServerConfig } from '../../src/services/storage';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { TimeoutError } from '../../src/utils/concurrency';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  fetchFoodVariants: jest.fn(),
  saveFood: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../src/utils/ids', () => ({ newUuid: () => 'client-uuid-1' }));

const mockCreate = jest.mocked(createFoodEntry);
const payload = {
  meal_type_id: 'meal-type-1',
  quantity: 2,
  unit: 'g',
  entry_date: '2026-10-17',
  food_id: 'food-1',
  variant_id: 'variant-1',
};
const preview = {
  foodName: 'Oats',
  brandName: 'Brand',
  mealTypeName: 'Breakfast',
  nutrition: { servingSize: 100, servingUnit: 'g', calories: 380, protein: 13 },
};
const serverEntry = {
  id: 'server-1',
  meal_type: 'Breakfast',
  quantity: 2,
  unit: 'g',
  entry_date: '2026-10-17',
  serving_size: 100,
  calories: 380,
};
const initialStore = useOfflineQueueStore.getState();

describe('useAddFoodEntry with the offline queue', () => {
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

  const render = (onSuccess = jest.fn()) =>
    renderHook(() => useAddFoodEntry({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

  test('sends with a client id and a bounded timeout, then refreshes the day', async () => {
    mockCreate.mockResolvedValue(serverEntry);
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = jest.fn();
    const { result } = render(onSuccess);

    act(() =>
      result.current.addEntry({
        createEntryPayload: payload,
        offlinePreview: preview,
      })
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(serverEntry));
    expect(mockCreate).toHaveBeenCalledWith(
      { ...payload, client_id: 'client-uuid-1' },
      { timeoutMs: expect.any(Number) }
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dailySummaryQueryKey('2026-10-17') })
    );
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('queues an entry whose request timed out, under the id that was sent', async () => {
    mockCreate.mockRejectedValue(new TimeoutError('Request', 10));
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = jest.fn();
    const { result } = render(onSuccess);

    act(() =>
      result.current.addEntry({
        createEntryPayload: payload,
        offlinePreview: preview,
      })
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [queued] = useOfflineQueueStore.getState().items;
    expect(queued).toMatchObject({
      id: 'client-uuid-1',
      kind: 'food_entry',
      entryDate: '2026-10-17',
      payload,
    });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      client_id: 'client-uuid-1',
    });
    // The caller gets the pending preview, which the diary overlays.
    const entry = onSuccess.mock.calls[0][0];
    expect(entry).toMatchObject({
      id: 'pending:client-uuid-1',
      food_name: 'Oats',
      meal_type: 'Breakfast',
      quantity: 2,
      calories: 380,
    });
    // Nothing changed on the server, so there is nothing to refetch.
    expect(spy).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
  });

  test('goes straight to the queue when the device is offline', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const onSuccess = jest.fn();
    const { result } = render(onSuccess);

    act(() =>
      result.current.addEntry({
        createEntryPayload: payload,
        offlinePreview: preview,
      })
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockCreate).not.toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().items).toHaveLength(1);
  });

  test('does not queue an entry that has no preview to show', async () => {
    mockCreate.mockRejectedValue(new TimeoutError('Request', 10));
    const { result } = render();

    act(() => result.current.addEntry({ createEntryPayload: payload }));

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Failed to add food' })
      )
    );
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('reports a rejected entry instead of queueing it', async () => {
    mockCreate.mockRejectedValue(new ApiError('Server error: 400', 400));
    const { result } = render();

    act(() =>
      result.current.addEntry({
        createEntryPayload: payload,
        offlinePreview: preview,
      })
    );

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Failed to add food' })
      )
    );
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });

  test('says a new food needs a connection rather than saving half of it', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const { result } = render();

    act(() =>
      result.current.addEntry({
        saveFoodPayload: { name: 'New food' } as never,
        createEntryPayload: payload,
        offlinePreview: preview,
      })
    );

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'This needs a connection',
        })
      )
    );
    expect(saveFood).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().items).toEqual([]);
  });
});
