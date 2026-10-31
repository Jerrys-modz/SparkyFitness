import { useQuery } from '@tanstack/react-query';
import { STAND_HOURS_SUPPORTED } from '../constants/activityRings';
import {
  readStandHours,
  requestStandHoursAccess,
} from '../services/standHours';
import { standHoursQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Hours stood in on a day, read from Apple Health on the device. Off (and `undefined`)
 * on Android and whenever `enabled` is false, so nothing is requested until a Stand ring
 * is on screen.
 */
export function useStandHours(day: string, enabled: boolean) {
  const isEnabled = enabled && STAND_HOURS_SUPPORTED;
  const query = useQuery({
    queryKey: standHoursQueryKey(day),
    queryFn: async () => {
      await requestStandHoursAccess();
      return readStandHours(day);
    },
    enabled: isEnabled,
  });
  useRefetchOnFocus(query.refetch, isEnabled);
  return query.data;
}
