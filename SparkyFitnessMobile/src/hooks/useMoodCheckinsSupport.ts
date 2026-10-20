import { useQuery } from '@tanstack/react-query';
import { todayInZone } from '@workspace/shared';
import { fetchMoodCheckinsForDate } from '../services/api/moodApi';
import { getDeviceTimezone } from '../utils/dateUtils';
import { usePreferences } from './usePreferences';
import { moodCheckinsSupportQueryKey } from './queryKeys';

/**
 * Whether the server keeps several mood check-ins per day: true when
 * `GET /api/mood/date/:day` answers with a list, false when it answers with
 * anything else, null while unknown (the request failed and nothing is known).
 */
export function useMoodCheckinsSupport(): {
  supported: boolean | null;
  isLoading: boolean;
} {
  const { preferences } = usePreferences();
  const timezone = preferences?.timezone || getDeviceTimezone();
  const query = useQuery({
    queryKey: moodCheckinsSupportQueryKey,
    // The answer only changes with a server upgrade; save, refresh and server
    // switch still re-probe, so keep it to avoid a flash of the wrong screen.
    gcTime: Infinity,
    // A failed probe throws so React Query retries and keeps any earlier answer
    // rather than caching "unknown" over it.
    queryFn: async () =>
      (await fetchMoodCheckinsForDate(todayInZone(timezone))) !== null,
  });

  return { supported: query.data ?? null, isLoading: query.isLoading };
}
