import { useMemo } from 'react';
import { calculateAge } from '@workspace/shared';
import type {
  HeartRateBand,
  PaceBand,
  PaceReferenceRace,
  StepEffort,
} from '@workspace/shared';
import { useCardioSessions } from './useCardioSessions';
import { usePreferences } from './usePreferences';
import { useProfile } from './useProfile';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import type { RecordingActivity } from '../utils/gpsRecording';
import {
  estimateMaxHeartRate,
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  suggestedPaceRangesFromRace,
  type SuggestedPair,
} from '../utils/suggestedRanges';

export interface SuggestedRanges {
  /**
   * Fast and easy pace ranges, from the person's recent race when they have
   * set one (`race`), else from recent sessions (`sessions`); null without
   * either.
   */
  pace:
    | (SuggestedPair<PaceBand> & {
        sessions: number;
        race: PaceReferenceRace | null;
      })
    | null;
  /** Ranges for tempo, marathon-pace and stride efforts; only from a race. */
  byEffort: Partial<Record<StepEffort, PaceBand>> | null;
  /** Fast and easy heart-rate ranges from the person's age, or null without a birth date. */
  heartRate: (SuggestedPair<HeartRateBand> & { maxHeartRate: number }) | null;
}

/**
 * Ranges to offer for a plan's fast and easy stretches: pace from a recent
 * race result when the person has set one, else from the last couple of months
 * of outdoor sessions of the same sport; heart rate from the estimated maximum
 * for the person's age. Reads the sessions the cardio view already loads, and
 * only when `enabled`.
 */
export function useSuggestedRanges(
  activity: RecordingActivity,
  enabled: boolean
): SuggestedRanges {
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const race = useAppPreferencesStore((s) => s.paceReferenceRace);
  const { sessions } = useCardioSessions('90d', enabled && activity !== 'ride');
  const dateOfBirth = profile?.date_of_birth ?? null;
  const timezone = preferences?.timezone ?? undefined;

  return useMemo(() => {
    const fromRace = race ? suggestedPaceRangesFromRace(race, activity) : null;
    const reference =
      activity === 'ride' || fromRace
        ? null
        : referencePace(sessions, activity, getTodayDate());
    const pace = reference ? suggestedPaceRanges(reference, activity) : null;
    const maxHeartRate = dateOfBirth
      ? estimateMaxHeartRate(calculateAge(dateOfBirth, timezone))
      : null;
    return {
      pace: fromRace
        ? { ...fromRace.pair, sessions: 0, race }
        : pace && reference
          ? { ...pace, sessions: reference.sessions, race: null }
          : null,
      byEffort: fromRace ? fromRace.byEffort : null,
      heartRate: maxHeartRate
        ? { ...suggestedHeartRateRanges(maxHeartRate), maxHeartRate }
        : null,
    };
  }, [activity, sessions, dateOfBirth, timezone, race]);
}
