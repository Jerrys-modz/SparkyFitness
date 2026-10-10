import type { IndividualSessionResponse } from '@workspace/shared';

import { queryClient } from '../../src/hooks/queryClient';
import { cardioSessionForDiaryEntry } from '../../src/services/cardioSessionForDiaryEntry';
import { fetchWorkoutGpsPoints } from '../../src/services/api/exerciseStatsApi';

jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchWorkoutGpsPoints: jest.fn(),
}));

const mockFetchGps = fetchWorkoutGpsPoints as jest.MockedFunction<
  typeof fetchWorkoutGpsPoints
>;

const entry = (
  overrides: Partial<IndividualSessionResponse> = {}
): IndividualSessionResponse =>
  ({
    type: 'individual',
    id: 'e1',
    name: 'Walking',
    entry_date: '2026-10-08',
    entry_time: '13:50:00',
    duration_minutes: 1.72,
    calories_burned: 8.4,
    avg_heart_rate: 105,
    distance: 0.16,
    source: 'Manual',
    notes: null,
    category: null,
    sets: [],
    exercise_snapshot: null,
    ...overrides,
  }) as IndividualSessionResponse;

describe('cardioSessionForDiaryEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('opens a synced workout without asking for a route', async () => {
    const result = await cardioSessionForDiaryEntry(
      entry({ source: 'apple_health' }),
      'km'
    );
    expect(result?.id).toBe('e1');
    expect(mockFetchGps).not.toHaveBeenCalled();
  });

  it('opens an in-app entry that has a stored route', async () => {
    mockFetchGps.mockResolvedValue({
      points: [{ lat: 1, lng: 2 }],
    } as never);
    const result = await cardioSessionForDiaryEntry(entry(), 'km');
    expect(result).toMatchObject({ id: 'e1', hasGpsTrack: true });
  });

  it('leaves an in-app entry with no route on the basic screen', async () => {
    mockFetchGps.mockResolvedValue(null);
    expect(await cardioSessionForDiaryEntry(entry(), 'km')).toBeNull();
  });

  it('falls back to the basic screen when the route lookup fails', async () => {
    mockFetchGps.mockRejectedValue(new Error('offline'));
    expect(await cardioSessionForDiaryEntry(entry(), 'km')).toBeNull();
  });

  it('never asks about a strength session', async () => {
    const strength = entry({
      sets: [{ weight: 50, reps: 5 }] as IndividualSessionResponse['sets'],
    });
    expect(await cardioSessionForDiaryEntry(strength, 'km')).toBeNull();
    expect(mockFetchGps).not.toHaveBeenCalled();
  });
});
