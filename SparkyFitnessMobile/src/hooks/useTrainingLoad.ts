import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  calculateAge,
  computeTrainingLoad,
  estimateMaxHeartRate,
  LOAD_WEEKS,
  type LoadSession,
} from '@workspace/shared';
import { fetchCardioSessionsPage } from '../services/api/exerciseStatsApi';
import { getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import { trainingLoadQueryKey } from './queryKeys';
import { useProfile } from './useProfile';
import { useRefetchOnFocus } from './useRefetchOnFocus';

// Four weeks of cardio sessions is well under one page for most people; a very
// busy month is cut at the newest sessions, which are the ones that matter.
const PAGE_SIZE = 100;

/**
 * Acute against chronic cardio load over the last four weeks. A fixed window
 * ending today, so it does not follow the screen's range control. Refreshed on
 * focus because a run saved elsewhere changes it.
 */
export function useTrainingLoad() {
  const today = getTodayDate();
  const { profile } = useProfile();
  const query = useQuery({
    queryKey: trainingLoadQueryKey(today),
    queryFn: () =>
      fetchCardioSessionsPage({
        startDate: addDays(today, -(LOAD_WEEKS * 7 - 1)),
        endDate: today,
        page: 1,
        pageSize: PAGE_SIZE,
        unitSystem: 'metric',
      }),
  });
  useRefetchOnFocus(query.refetch);

  const dateOfBirth = profile?.date_of_birth ?? null;
  const load = useMemo(() => {
    if (!query.data) return undefined;
    const sessions: LoadSession[] = query.data.items.map((item) => ({
      day: item.entryDate,
      durationMinutes: item.durationMinutes,
      avgHeartRate: item.avgHeartRate,
    }));
    const age = dateOfBirth
      ? calculateAge(dateOfBirth, getDeviceTimezone())
      : null;
    return computeTrainingLoad(sessions, today, estimateMaxHeartRate(age));
  }, [query.data, dateOfBirth, today]);

  return {
    load,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
