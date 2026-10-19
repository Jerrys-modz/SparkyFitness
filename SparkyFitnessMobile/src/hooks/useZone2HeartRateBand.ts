import { useMemo } from 'react';
import {
  calculateAge,
  zone2HeartRateRangeForAge,
  type HeartRateBand,
} from '@workspace/shared';
import { usePreferences } from './usePreferences';
import { useProfile } from './useProfile';

/**
 * The person's Zone 2 heart-rate range, or null without a date of birth. Today
 * it comes from the age-based maximum heart rate in `@workspace/shared`; this
 * hook is the one place to read the person's own zones from once they can be
 * set.
 */
export function useZone2HeartRateBand(): HeartRateBand | null {
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const dateOfBirth = profile?.date_of_birth ?? null;
  const timezone = preferences?.timezone ?? undefined;
  return useMemo(
    () =>
      dateOfBirth
        ? zone2HeartRateRangeForAge(calculateAge(dateOfBirth, timezone))
        : null,
    [dateOfBirth, timezone]
  );
}
