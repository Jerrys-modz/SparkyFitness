import { useQuery } from '@tanstack/react-query';
import { recordingCaloriesPerHour } from '../services/gpsRecordingSave';
import type { RecordingActivity } from '../utils/gpsRecording';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * The calories per hour the server will apply to a saved recording of
 * `activity` (see `recordingCaloriesPerHour`), or null while loading, when
 * the lookup fails, or when the server would work it out another way.
 */
export function useRecordingCaloriesPerHour(
  activity: RecordingActivity,
  enabled: boolean
): number | null {
  const { data } = useQuery({
    queryKey: ['recordingCaloriesPerHour', activity],
    queryFn: () => recordingCaloriesPerHour(activity),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  });
  return data ?? null;
}
