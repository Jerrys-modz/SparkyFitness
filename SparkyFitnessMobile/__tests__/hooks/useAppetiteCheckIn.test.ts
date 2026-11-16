import { renderHook, waitFor, act } from '@testing-library/react-native';

import { useAppetiteCheckIn } from '../../src/hooks/useAppetiteCheckIn';
import { customCategoriesQueryKey } from '../../src/hooks/queryKeys';
import {
  createCustomCategory,
  fetchCustomCategories,
  fetchCustomMeasurementsByDate,
  saveCustomMeasurement,
} from '../../src/services/api/measurementsApi';
import { appetiteMetricsFor } from '@workspace/shared';

const GLP1_METRICS = appetiteMetricsFor('glp1');
const displayName = (key: string) => `Label ${key}`;
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchCustomCategories: jest.fn(),
  fetchCustomMeasurementsByDate: jest.fn(),
  createCustomCategory: jest.fn(),
  saveCustomMeasurement: jest.fn(),
}));

const mockFetchCustomCategories = fetchCustomCategories as jest.MockedFunction<
  typeof fetchCustomCategories
>;
const mockFetchMeasurements =
  fetchCustomMeasurementsByDate as jest.MockedFunction<
    typeof fetchCustomMeasurementsByDate
  >;
const mockCreateCustomCategory = createCustomCategory as jest.MockedFunction<
  typeof createCustomCategory
>;
const mockSaveCustomMeasurement = saveCustomMeasurement as jest.MockedFunction<
  typeof saveCustomMeasurement
>;

const values = {
  hunger: 1,
  food_noise: 2,
  fullness: 3,
  energy: 4,
};

describe('useAppetiteCheckIn', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockFetchCustomCategories.mockResolvedValue([]);
    mockFetchMeasurements.mockResolvedValue([]);
    mockCreateCustomCategory.mockImplementation(async (body) => ({
      id: `cat-${body.name}`,
      name: body.name,
      display_name: body.display_name,
      measurement_type: body.measurement_type,
      frequency: body.frequency,
      data_type: body.data_type,
    }));
    mockSaveCustomMeasurement.mockResolvedValue({
      id: 'entry',
      category_id: 'cat',
      value: '1',
      entry_date: '2026-10-10',
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('reuses categories created before a partial save failure', async () => {
    mockSaveCustomMeasurement.mockImplementation(async () => {
      if (mockSaveCustomMeasurement.mock.calls.length === 2) {
        throw new Error('partial');
      }
      return {
        id: 'entry',
        category_id: 'cat',
        value: '1',
        entry_date: '2026-10-10',
      };
    });

    const { result } = renderHook(
      () => useAppetiteCheckIn('2026-10-10', 'glp1', displayName),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.save.mutateAsync(values)).rejects.toThrow(
        'partial'
      );
    });

    mockSaveCustomMeasurement.mockResolvedValue({
      id: 'entry',
      category_id: 'cat',
      value: '1',
      entry_date: '2026-10-10',
    });

    await act(async () => {
      await result.current.save.mutateAsync(values);
    });

    const createdNames = mockCreateCustomCategory.mock.calls.map(
      (call) => call[0].name
    );
    expect(createdNames).toEqual(
      GLP1_METRICS.map((metric) => metric.categoryName)
    );
    expect(mockSaveCustomMeasurement).toHaveBeenCalledTimes(
      // The failed attempt saved the first metric and threw on the second.
      GLP1_METRICS.length + 2
    );
    expect(mockSaveCustomMeasurement.mock.calls[0]?.[0].category_id).toBe(
      'cat-GLP Hunger'
    );
    expect(mockSaveCustomMeasurement.mock.calls.at(-1)?.[0].category_id).toBe(
      'cat-GLP Energy'
    );
  });

  test('invalidates categories when a save fails', async () => {
    mockSaveCustomMeasurement.mockRejectedValue(new Error('partial'));
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useAppetiteCheckIn('2026-10-10', 'glp1', displayName),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.save.mutateAsync(values)).rejects.toThrow(
        'partial'
      );
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: customCategoriesQueryKey })
    );
  });

  test('the hunger & fullness check-in saves no energy and names new categories', async () => {
    const { result } = renderHook(
      () => useAppetiteCheckIn('2026-10-10', 'appetite', displayName),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.save.mutateAsync(values);
    });

    expect(mockCreateCustomCategory.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        name: 'GLP Hunger',
        display_name: 'Label hunger',
        frequency: 'Daily',
      }),
      expect.objectContaining({
        name: 'GLP Food Noise',
        display_name: 'Label food_noise',
      }),
      expect.objectContaining({ name: 'GLP Fullness' }),
    ]);
    expect(
      mockSaveCustomMeasurement.mock.calls.map((call) => call[0].value)
    ).toEqual(['1', '2', '3']);
  });

  test('loads the day from the existing GLP-1 categories', async () => {
    mockFetchCustomCategories.mockResolvedValue([
      {
        id: 'h',
        name: 'GLP Hunger',
        measurement_type: 'score (0–10)',
        frequency: 'Daily',
      },
    ]);
    mockFetchMeasurements.mockResolvedValue([
      { id: 'e', category_id: 'h', value: '9', entry_date: '2026-10-10' },
    ]);
    const { result } = renderHook(
      () => useAppetiteCheckIn('2026-10-10', 'appetite', displayName),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.hasSavedValues).toBe(true));
    expect(result.current.loadedValues.hunger).toBe(9);
    expect(result.current.loadedValues.fullness).toBe(5);
  });
});
