import { useQuery } from '@tanstack/react-query';
import { todayInZone } from '@workspace/shared';
import { fetchMoodCheckinsForDate } from '../services/api/moodApi';
import { getDeviceTimezone } from '../utils/dateUtils';
import { usePreferences } from './usePreferences';
import { moodCheckinsSupportQueryKey } from './queryKeys';

/**
 * Whether the server keeps several mood check-ins per day: true when
 * `GET /api/mood/date/:day` answers with a list, false when it answers with
 * anything else, null when the request fails (unknown).
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
    queryFn: async () => {
      try {
        return (await fetchMoodCheckinsForDate(todayInZone(timezone))) !== null;
      } catch {
        return null;
      }
    },
  });

  return { supported: query.data ?? null, isLoading: query.isLoading };
}
