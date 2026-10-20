import { useQuery } from '@tanstack/react-query';
import { fetchMoodEntries, type MoodEntry } from '../services/api/moodApi';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { moodRatingsSupportQueryKey } from './queryKeys';

const PROBE_DAYS = 365;

/**
 * Older servers omit `energy_value` from every row. `null` means unknown
 * (no rows to inspect), so a brand-new account still shows the ratings.
 */
export function moodEntriesSupportRatings(
  entries: MoodEntry[]
): boolean | null {
  if (entries.length === 0) return null;
  return entries.some((entry) => 'energy_value' in entry);
}

export function useMoodRatingsSupport(): {
  supported: boolean | null;
  isLoading: boolean;
} {
  const today = getTodayDate();
  const query = useQuery({
    queryKey: moodRatingsSupportQueryKey,
    queryFn: async () =>
      moodEntriesSupportRatings(
        await fetchMoodEntries(addDays(today, -PROBE_DAYS), today)
      ),
  });

  return { supported: query.data ?? null, isLoading: query.isLoading };
}
