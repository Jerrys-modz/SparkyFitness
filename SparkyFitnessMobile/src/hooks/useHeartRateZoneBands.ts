import { useMemo } from 'react';
import {
  heartRateDisplayBands,
  resolvedHeartRateZonesFromResponse,
  type HeartRateDisplayBand,
} from '@workspace/shared';
import { useHeartRateZones } from './useHeartRateZones';

/**
 * The bands a heart rate chart colors its line by: the person's five zones,
 * or four tiers if they chose that in Settings > Heart Rate Zones. Until
 * their zones load this is the shared default, so the line is still colored.
 */
export function useHeartRateZoneBands(): HeartRateDisplayBand[] {
  const { zones } = useHeartRateZones();
  return useMemo(
    () =>
      heartRateDisplayBands(
        resolvedHeartRateZonesFromResponse(zones).zones,
        zones?.settings.display_zones ?? 5
      ),
    [zones]
  );
}
