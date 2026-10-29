import type { RecordingActivity } from './gpsRecording';

/**
 * Net kcal per kg of body weight per km travelled on foot, from the ACSM
 * running and walking equations. A ride is estimated by time instead.
 */
const KCAL_PER_KG_PER_KM: Partial<Record<RecordingActivity, number>> = {
  run: 1,
  walk: 0.5,
};

/** Kcal per kg per hour (a MET is 1 kcal/kg/h) for when there is no distance. */
const KCAL_PER_KG_PER_HOUR: Record<RecordingActivity, number> = {
  run: 9.8,
  walk: 3.5,
  ride: 7.5,
};

/**
 * A rough live estimate of the energy a recording has burned, for the screen
 * while it runs. The saved activity gets its calories from the server, so this
 * is only a guide. Null without a body weight to work from. Outdoors a walk
 * or run counts by distance, which follows effort; indoors, where distance
 * is only a guess, and for a ride it counts by active time.
 */
export function estimateRecordingKcal(
  activity: RecordingActivity,
  weightKg: number | null,
  distanceMeters: number,
  activeSeconds: number,
  indoor: boolean
): number | null {
  if (weightKg == null || !(weightKg > 0)) return null;
  const perKm = KCAL_PER_KG_PER_KM[activity];
  if (perKm != null && !indoor) {
    return weightKg * perKm * (distanceMeters / 1000);
  }
  return weightKg * KCAL_PER_KG_PER_HOUR[activity] * (activeSeconds / 3600);
}
