import { useLatestMeasurementsOnOrBefore } from './useMeasurements';
import { getTodayDate } from '../utils/dateUtils';

/**
 * The lifter's body weight (kg) on `date`: the newest check-in weight on or
 * before it. Bodyweight exercises count it in their volume and estimated
 * maxes. Null while loading, on failure, or with no weight recorded, in which
 * case only the added weight counts (see `effectiveLoadKg`).
 *
 * Pass `enabled: false` when nothing on screen is a bodyweight exercise, so
 * ordinary workouts cost no extra request.
 */
export function useBodyWeightKg(
  date: string | null | undefined,
  enabled: boolean
): number | null {
  const { latestMeasurements } = useLatestMeasurementsOnOrBefore({
    date: date ?? getTodayDate(),
    enabled,
  });
  const weight = Number(latestMeasurements?.weight);
  return enabled && weight > 0 ? weight : null;
}
