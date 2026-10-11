import { renderHook, waitFor } from '@testing-library/react-native';
import { useVo2MaxRange } from '../../src/hooks/useVo2MaxRange';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsRange,
} from '../../src/services/api/measurementsApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchCustomCategories: jest.fn(),
  fetchCustomMeasurementsRange: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const categories = jest.mocked(fetchCustomCategories);
const entries = jest.mocked(fetchCustomMeasurementsRange);

const run = () =>
  renderHook(() => useVo2MaxRange({ range: '30d' }), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

beforeEach(() => jest.resetAllMocks());

test('is empty when VO2 max was never synced', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'steps' }] as never);
  const { result } = run();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.vo2MaxData).toEqual([]);
  expect(entries).not.toHaveBeenCalled();
});

test('keeps the latest reading per day, oldest first, and drops junk', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'vo2_max' }] as never);
  entries.mockResolvedValue([
    {
      entry_date: '2026-10-09',
      value: '44.1',
      entry_timestamp: '2026-10-09T08:00:00Z',
    },
    {
      entry_date: '2026-10-05',
      value: '42.5',
      entry_timestamp: '2026-10-05T08:00:00Z',
    },
    {
      entry_date: '2026-10-09',
      value: '44.8',
      entry_timestamp: '2026-10-09T18:00:00Z',
    },
    {
      entry_date: '2026-10-07',
      value: 'abc',
      entry_timestamp: '2026-10-07T08:00:00Z',
    },
    {
      entry_date: '2026-10-08',
      value: '0',
      entry_timestamp: '2026-10-08T08:00:00Z',
    },
  ] as never);
  const { result } = run();
  await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(2));
  expect(result.current.vo2MaxData).toEqual([
    { day: '2026-10-05', vo2max: 42.5 },
    { day: '2026-10-09', vo2max: 44.8 },
  ]);
  expect(entries).toHaveBeenCalledWith(
    'c1',
    expect.any(String),
    expect.any(String)
  );
});
