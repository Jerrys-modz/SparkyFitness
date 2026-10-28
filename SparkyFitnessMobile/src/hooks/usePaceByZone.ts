import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildPaceByZone, paceByZoneStartDay } from '@workspace/shared';
import { fetchCardioSessionsWindow } from '../services/api/exerciseStatsApi';
import { paceByZoneQueryKey } from './queryKeys';
import { useHeartRateZones } from './useHeartRateZones';
import { getTodayDate } from '../utils/dateUtils';

/** Calendar months of running shown on the card, the current one included. */
export const PACE_BY_ZONE_MONTHS = 4;

/**
 * Monthly average running pace in heart-rate zones 2 and 3, from the last few
 * months of runs and the person's own zones. The key sits in the
 * `cardioSessions` family, so the Cardio refresh and exercise cache
 * invalidation reload it with the session list.
 */
export function usePaceByZone(enabled = true) {
  const today = getTodayDate();
  const startDate = paceByZoneStartDay(today, PACE_BY_ZONE_MONTHS);
  const { zones } = useHeartRateZones(enabled);

  const sessions = useQuery({
    queryKey: paceByZoneQueryKey(startDate, today),
    queryFn: () => fetchCardioSessionsWindow(startDate, today),
    enabled,
  });

  const result = useMemo(
    () =>
      sessions.data && zones
        ? buildPaceByZone(
            sessions.data,
            zones.resolved.zones.map((z) => z.lower_bpm),
            { today, months: PACE_BY_ZONE_MONTHS, zones: [2, 3] }
          )
        : null,
    [sessions.data, zones, today]
  );

  return {
    zones: result,
    isLoading: sessions.isLoading,
    isError: sessions.isError,
  };
}
