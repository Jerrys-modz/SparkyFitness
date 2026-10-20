import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useCreateMoodCheckin,
  useDeleteMoodCheckin,
  useMoodCheckinsForDate,
  useMoodEntryForDate,
  useUpdateMoodCheckin,
} from '../../src/hooks/useMood';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  fetchLegacyMoodEntries,
  fetchMoodCheckinsForDate,
  updateMoodCheckin,
} from '../../src/services/api/moodApi';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/moodApi', () => ({
  createMoodCheckin: jest.fn(),
  deleteMoodCheckin: jest.fn(),
  fetchCustomMoods: jest.fn(),
  fetchLegacyMoodEntries: jest.fn(),
  fetchMoodCheckinsForDate: jest.fn(),
  fetchMoodEntries: jest.fn(),
  saveMoodEntry: jest.fn(),
  updateMoodCheckin: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mocked = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as jest.Mock;

describe('mood check-in hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads a day under its own key', async () => {
    mocked(fetchMoodCheckinsForDate).mockResolvedValue([]);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoodCheckinsForDate('2026-10-05'), {
      wrapper: createQueryWrapper(client),
    });

    await waitFor(() => expect(result.current.checkins).toEqual([]));
    expect(
      client.getQueryData(['moodEntries', 'checkins', '2026-10-05'])
    ).toEqual([]);
  });

  it('keeps the legacy single-day entry apart from a one-day range', async () => {
    mocked(fetchLegacyMoodEntries).mockResolvedValue([{ id: 'a' }]);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoodEntryForDate('2026-10-05'), {
      wrapper: createQueryWrapper(client),
    });

    await waitFor(() => expect(result.current.entry).toEqual({ id: 'a' }));
    expect(
      client.getQueryData(['moodEntries', 'legacyDay', '2026-10-05'])
    ).toEqual({ id: 'a' });
    expect(
      client.getQueryData(['moodEntries', '2026-10-05', '2026-10-05'])
    ).toBeUndefined();
  });

  const expectBothInvalidated = (spy: jest.SpyInstance) => {
    const keys = spy.mock.calls.map(([filters]) => filters.queryKey);
    expect(keys).toContainEqual(['moodEntries']);
    expect(keys).toContainEqual(['cycleCorrelations']);
  };

  const invalidatingClient = () => {
    const client = createTestQueryClient();
    return { client, spy: jest.spyOn(client, 'invalidateQueries') };
  };

  it('create invalidates mood entries and cycle correlations', async () => {
    mocked(createMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useCreateMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        mood_value: 50,
        entry_date: '2026-10-05',
        entry_timestamp: '2026-10-05T14:00:00.000Z',
      });
    });

    expectBothInvalidated(spy);
  });

  it('update invalidates mood entries and cycle correlations', async () => {
    mocked(updateMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useUpdateMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'x', body: { notes: 'hi' } });
    });

    expectBothInvalidated(spy);
  });

  it('delete invalidates mood entries and cycle correlations', async () => {
    mocked(deleteMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useDeleteMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('x');
    });

    expectBothInvalidated(spy);
  });
});
