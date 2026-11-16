import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  detectWeightPlateau,
  isWeightPlateauDismissed,
  weightGoalDirection,
  type WeightPlateau,
  type WeightSample,
} from '@workspace/shared';
import { fetchMeasurementsRange } from '../services/api/measurementsApi';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { measurementsRangeQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Weigh-ins read for the check, independent of any chart range. */
const PLATEAU_LOOKBACK_DAYS = 90;

/**
 * The person's current weight plateau (shared `detectWeightPlateau`, the same
 * check as the web Reports card and the AI engagement tool) over the last 90
 * days, judged against their Goal Mode. Null at maintenance or recomposition,
 * when there is no plateau, or once this plateau was dismissed.
 */
export function useWeightPlateau({ enabled = true }: { enabled?: boolean }): {
  plateau: WeightPlateau | null;
  dismiss: () => void;
} {
  const { preferences } = usePreferences({ enabled });
  const direction = weightGoalDirection(preferences);
  const active = enabled && direction !== 'none';
  const today = getTodayDate();
  const startDate = addDays(today, -(PLATEAU_LOOKBACK_DAYS - 1));

  const query = useQuery({
    queryKey: measurementsRangeQueryKey(startDate, today),
    queryFn: () => fetchMeasurementsRange(startDate, today),
    enabled: active,
  });
  useRefetchOnFocus(query.refetch, active);

  const dismissedEnd = useAppPreferencesStore(
    (s) => s.weightPlateauDismissedEnd
  );
  const setDismissedEnd = useAppPreferencesStore(
    (s) => s.setWeightPlateauDismissedEnd
  );

  const plateau = useMemo(() => {
    if (!active || !query.data) return null;
    // The API returns the newest row of a day first; keep that one.
    const byDay = new Map<string, number>();
    for (const entry of query.data) {
      if (!byDay.has(entry.entry_date) && entry.weight != null) {
        byDay.set(entry.entry_date, entry.weight);
      }
    }
    const samples: WeightSample[] = [...byDay].map(([date, weight]) => ({
      date,
      weight,
    }));
    return detectWeightPlateau(samples, direction, { today });
  }, [active, query.data, direction, today]);

  return {
    plateau:
      plateau && !isWeightPlateauDismissed(plateau, dismissedEnd)
        ? plateau
        : null,
    dismiss: () => {
      if (plateau) setDismissedEnd(plateau.endDate);
    },
  };
}
