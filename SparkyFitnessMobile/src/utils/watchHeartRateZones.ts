import type { HeartRateZonesResponse } from '@workspace/shared';

/**
 * The five ascending zone floors (bpm) the watch draws its zone bar from, or
 * null when the person's zones are not known yet. The watch checks the same
 * rule (`WatchHeartRateZones.normalized`) and draws no bar for anything else.
 */
export function watchHeartRateZoneFloors(
  zones: HeartRateZonesResponse | undefined
): number[] | null {
  const floors = zones?.resolved.zones.map((zone) => zone.lower_bpm);
  if (!floors || floors.length !== 5) return null;
  const ascending = floors.every(
    (floor, i) => floor > 0 && (i === 0 || floor > floors[i - 1]!)
  );
  return ascending ? floors : null;
}
