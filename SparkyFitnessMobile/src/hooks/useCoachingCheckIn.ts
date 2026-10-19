import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateCoachingSettingsBody } from '@workspace/shared';
import {
  acceptCoachingCheckIn,
  fetchCoachingCheckIn,
  saveCoachingSettings,
} from '../services/api/coachingApi';
import { getTodayDate } from '../utils/dateUtils';
import { coachingCheckInQueryKey } from './queryKeys';
import { invalidateGoalCaches } from './useGoals';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const COACHING_CHECK_IN_ROOT_KEY = ['coachingCheckIn'] as const;

/**
 * The weekly coaching check-in, worked out on the server from the last weeks of
 * weigh-ins and logged intake. A fixed window ending today, refreshed on focus
 * because a weigh-in or meal logged elsewhere changes it. `enabled` lets a
 * hidden Dashboard card skip the request.
 */
export function useCoachingCheckIn(enabled = true) {
  const query = useQuery({
    queryKey: coachingCheckInQueryKey(getTodayDate()),
    queryFn: fetchCoachingCheckIn,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    checkIn: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCoachingMutations() {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: (calories: number) => acceptCoachingCheckIn(calories),
    onSuccess: () => {
      invalidateGoalCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: COACHING_CHECK_IN_ROOT_KEY });
    },
    // A refused accept (409) means the check-in moved on; show the new one.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: COACHING_CHECK_IN_ROOT_KEY });
    },
  });
  const saveSettings = useMutation({
    mutationFn: (body: UpdateCoachingSettingsBody) =>
      saveCoachingSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COACHING_CHECK_IN_ROOT_KEY });
    },
  });
  return {
    acceptCheckIn: accept.mutateAsync,
    isAccepting: accept.isPending,
    saveSettings: saveSettings.mutateAsync,
    isSavingSettings: saveSettings.isPending,
  };
}
