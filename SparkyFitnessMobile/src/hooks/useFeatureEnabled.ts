import { useQuery } from '@tanstack/react-query';
import { isFeatureEnabled, type FeatureKey } from '@workspace/shared';

import { fetchFeatureChoices } from '../services/api/featureChoicesApi';
import { featureChoicesQueryKey } from './queryKeys';

/**
 * Whether an optional feature shows in the mobile app (#3487). False until the
 * choices have loaded and when they cannot be read (no server, or one too old
 * to have them, which answers 404), so a feature the person turned off never
 * flashes back.
 *
 * Only for features stored in `feature_choices`; cycle's gates still read
 * `cycle_settings.enabled`.
 */
export function useMobileFeatureEnabled(key: FeatureKey): boolean {
  const { data } = useQuery({
    queryKey: featureChoicesQueryKey,
    queryFn: fetchFeatureChoices,
    // A choice changed in the other app shows within a few minutes, on the
    // next screen that asks; active-server switches clear the cache.
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return false;
  return isFeatureEnabled(key, 'mobile', {
    choices: data.feature_choices,
    cycleEnabled: undefined,
  });
}
