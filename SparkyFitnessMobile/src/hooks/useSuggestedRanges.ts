import { useMemo } from 'react';
import { calculateAge } from '@workspace/shared';
import type { HeartRateBand, PaceBand } from '@workspace/shared';
import { useCardioSessions } from './useCardioSessions';
import { usePreferences } from './usePreferences';
import { useProfile } from './useProfile';
import { getTodayDate } from '../utils/dateUtils';
import type { RecordingActivity } from '../utils/gpsRecording';
import {
  estimateMaxHeartRate,
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  type SuggestedPair,
} from '../utils/suggestedRanges';

export interface SuggestedRanges {
  /** Fast and easy pace ranges from recent sessions, or null without enough history. */
  pace: (SuggestedPair<PaceBand> & { sessions: number }) | null;
  /** Fast and easy heart-rate ranges from the person's age, or null without a birth date. */
  heartRate: (SuggestedPair<HeartRateBand> & { maxHeartRate: number }) | null;
}

/**
 * Ranges to offer for a plan's fast and easy stretches: pace from the last
 * couple of months of outdoor sessions of the same sport, heart rate from the
 * estimated maximum for the person's age. Reads the sessions the cardio view
 * already loads, and only when `enabled`.
 */
export function useSuggestedRanges(
  activity: RecordingActivity,
  enabled: boolean
): SuggestedRanges {
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const { sessions } = useCardioSessions('90d', enabled && activity !== 'ride');
  const dateOfBirth = profile?.date_of_birth ?? null;
  const timezone = preferences?.timezone ?? undefined;

  return useMemo(() => {
    const reference =
      activity === 'ride'
        ? null
        : referencePace(sessions, activity, getTodayDate());
    const pace = reference ? suggestedPaceRanges(reference, activity) : null;
    const maxHeartRate = dateOfBirth
      ? estimateMaxHeartRate(calculateAge(dateOfBirth, timezone))
      : null;
    return {
      pace:
        pace && reference ? { ...pace, sessions: reference.sessions } : null,
      heartRate: maxHeartRate
        ? { ...suggestedHeartRateRanges(maxHeartRate), maxHeartRate }
        : null,
    };
  }, [activity, sessions, dateOfBirth, timezone]);
}
