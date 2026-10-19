import { useMemo } from 'react';
import { zone2HeartRateBand, type HeartRateBand } from '@workspace/shared';
import { useHeartRateZones } from './useHeartRateZones';

/**
 * The person's Zone 2 heart-rate range, from their own zones (a maximum or
 * resting rate they set, the zone method they chose). Null until zones are
 * known, and without a maximum from their date of birth or their own entry,
 * because a typical figure is not worth holding a run to.
 */
export function useZone2HeartRateBand(): HeartRateBand | null {
  const { zones } = useHeartRateZones(true);
  const resolved = zones?.resolved;
  return useMemo(() => {
    if (!resolved) return null;
    if (resolved.max_hr_source !== 'user' && resolved.max_hr_source !== 'age') {
      return null;
    }
    return zone2HeartRateBand({
      maxHr: resolved.max_hr,
      zones: resolved.zones.map((zone) => ({
        zone: zone.zone,
        lowerBpm: zone.lower_bpm,
        upperBpm: zone.upper_bpm,
      })),
    });
  }, [resolved]);
}
