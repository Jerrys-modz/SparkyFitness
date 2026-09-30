import { useQueries } from '@tanstack/react-query';
import { fetchWorkoutHrZones } from '../services/api/exerciseStatsApi';
import { cardioSessionDetailQueryKey } from './queryKeys';
import {
  combinedHeartRateZoneRows,
  type HeartRateZoneRow,
} from '../utils/cardioSession';

/**
 * Time in each heart-rate zone for a whole workout, summed over its exercise
 * entries (the watch stores zones per exercise).
 *
 * Only entries that carry an average heart rate are fetched: an exercise with
 * none has no zones either, and a workout logged without a watch then costs
 * no requests at all. Each entry uses the cardio session screen's query key,
 * so an entry already opened there is not fetched twice.
 *
 * Null while any of those is still loading, or when no entry has zones.
 */
export function useWorkoutHeartRateZones(
  exercises: readonly { id: string; avg_heart_rate?: number | null }[]
): HeartRateZoneRow[] | null {
  const entryIds = exercises
    .filter((exercise) => (exercise.avg_heart_rate ?? 0) > 0)
    .map((exercise) => String(exercise.id));
  return useQueries({
    queries: entryIds.map((id) => ({
      queryKey: cardioSessionDetailQueryKey('hrZones', id),
      queryFn: () => fetchWorkoutHrZones(id),
    })),
    combine: (results) => {
      if (results.length === 0 || results.some((r) => r.isPending)) {
        return null;
      }
      const rows = combinedHeartRateZoneRows(results.map((r) => r.data ?? []));
      return rows.some((row) => row.seconds > 0) ? rows : null;
    },
  });
}
