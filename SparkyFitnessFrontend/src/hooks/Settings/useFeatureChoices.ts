import { preferencesKeys } from '@/api/keys/settings';
import {
  getFeatureChoices,
  updateFeatureChoices,
} from '@/api/Settings/featureChoices';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isFeatureEnabled, type FeatureKey } from '@workspace/shared';

/**
 * Whether an optional feature shows on the website (#3487). Answers false
 * until the choices have loaded, and when they cannot be read: showing the
 * default instead would bring back a feature the person turned off.
 *
 * Only for features stored in `feature_choices`; cycle's gates still read
 * `cycle_settings.enabled`.
 */
export const useWebFeatureEnabled = (key: FeatureKey): boolean => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { data } = useQuery({
    queryKey: preferencesKeys.featureChoices(activeUserId ?? user?.id),
    queryFn: getFeatureChoices,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return false;
  return isFeatureEnabled(key, 'web', {
    choices: data.feature_choices,
    cycleEnabled: undefined,
  });
};

/** Turns a feature stored in `feature_choices` on or off for the website. */
export const useSetWebFeatureEnabled = (key: FeatureKey) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      updateFeatureChoices({ web: { [key]: enabled } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: preferencesKeys.featureChoices(activeUserId ?? user?.id),
      }),
  });
};
