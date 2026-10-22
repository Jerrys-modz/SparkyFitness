import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import {
  dailySummaryQueryKey,
  measurementsQueryKey,
} from '../../src/hooks/queryKeys';
import type { DailySummaryRawData } from '../../src/services/dailySummaryService';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { checkInItem, foodItem, waterItem } from '../helpers/offlineQueue';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const DATE = '2026-10-17';
const raw = (): DailySummaryRawData =>
  ({
    goals: { calories: 2000, protein: 150, water_goal_ml: 2500 },
    foodEntries: [
      {
        id: 'server-1',
        quantity: 1,
        serving_size: 1,
        calories: 300,
        protein: 10,
        carbs: 0,
        fat: 0,
      },
    ],
    exerciseEntries: [],
    waterIntake: { water_ml: 500 },
    stepCalories: 0,
  }) as unknown as DailySummaryRawData;
const initialStore = useOfflineQueueStore.getState();

describe('offline overlay in the read hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    useOfflineQueueStore.setState({
      ...initialStore,
      items: [],
      attention: [],
      settling: [],
      activeConfigId: 'config-1',
    });
    queryClient = createTestQueryClient({
      queries: { retry: false, staleTime: Infinity },
    });
    queryClient.setQueryData(dailySummaryQueryKey(DATE), raw());
    queryClient.setQueryData(measurementsQueryKey(DATE), {
      entry_date: DATE,
      weight: 81,
    });
  });

  afterEach(() => queryClient.clear());

  const renderSummary = () =>
    renderHook(() => useDailySummary({ date: DATE, enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

  test('shows the cached day untouched when nothing is waiting', () => {
    const { result } = renderSummary();
    expect(result.current.summary?.foodEntries).toHaveLength(1);
    expect(result.current.summary?.waterConsumed).toBe(500);
  });

  test('adds queued food and water to the cached totals', () => {
    useOfflineQueueStore.setState({
      items: [
        foodItem('a'), // preview: 100 kcal
        waterItem('w', undefined, 250),
      ],
    });
    const { result } = renderSummary();

    expect(result.current.summary?.foodEntries.map((e) => e.id)).toEqual([
      'server-1',
      'pending:a',
    ]);
    expect(result.current.summary?.caloriesConsumed).toBe(400);
    expect(result.current.summary?.waterConsumed).toBe(750);
  });

  test('updates when an item joins the queue, and again when it is cancelled', async () => {
    const { result } = renderSummary();
    expect(result.current.summary?.caloriesConsumed).toBe(300);

    act(() => useOfflineQueueStore.setState({ items: [foodItem('a')] }));
    await waitFor(() =>
      expect(result.current.summary?.caloriesConsumed).toBe(400)
    );

    act(() => useOfflineQueueStore.setState({ items: [] }));
    await waitFor(() =>
      expect(result.current.summary?.caloriesConsumed).toBe(300)
    );
  });

  test('keeps an item just sent visible until its refetch has settled', () => {
    useOfflineQueueStore.setState({ settling: [foodItem('a')] });
    const { result } = renderSummary();
    expect(result.current.summary?.caloriesConsumed).toBe(400);
  });

  test('ignores items for other days and other servers', () => {
    useOfflineQueueStore.setState({
      items: [
        foodItem('a', undefined, { entryDate: '2026-10-16' }),
        { ...foodItem('b'), configId: 'config-2' },
      ],
    });
    const { result } = renderSummary();
    expect(result.current.summary?.caloriesConsumed).toBe(300);
  });

  test('does not write the overlay into the cache', () => {
    useOfflineQueueStore.setState({ items: [foodItem('a')] });
    renderSummary();
    expect(
      queryClient.getQueryData<DailySummaryRawData>(dailySummaryQueryKey(DATE))
        ?.foodEntries
    ).toHaveLength(1);
  });

  test('shows a queued weight over the cached measurement', () => {
    useOfflineQueueStore.setState({
      items: [checkInItem('c', undefined, 79.5)],
    });
    const { result } = renderHook(
      () => useMeasurements({ date: DATE, enabled: false }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    expect(result.current.measurements?.weight).toBe(79.5);
  });
});
