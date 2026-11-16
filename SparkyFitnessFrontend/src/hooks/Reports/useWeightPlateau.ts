import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  detectWeightPlateau,
  isWeightPlateauDismissed,
  todayInZone,
  weightGoalDirection,
  type WeightPlateau,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useRecentStandardMeasurements } from '@/hooks/CheckIn/useCheckIn';

/** Weigh-ins read for the check, independent of the report's date range. */
const PLATEAU_LOOKBACK_DAYS = 90;

/** Kept per person, so a browser a family shares never mixes dismissals. */
const dismissedKey = (userId: string) =>
  `sparky.weightPlateauDismissedEnd.${userId}`;

function readDismissed(userId: string | null): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(dismissedKey(userId));
  } catch {
    return null;
  }
}

export interface WeightPlateauState {
  /** The current plateau in kg, or null when there is none to show. */
  plateau: WeightPlateau | null;
  /** Hides this plateau until a new one starts. */
  dismiss: () => void;
}

/**
 * The person's current weight plateau (shared `detectWeightPlateau`) over the
 * last 90 days of weigh-ins, judged against their Goal Mode. Owner only: the
 * goal mode in preferences is the signed-in person's, so nothing shows while
 * acting for someone else.
 */
export function useWeightPlateau(): WeightPlateauState {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const {
    timezone,
    goalMode,
    goalModeCustomPercentage,
    goalModeWeeklyChangeKg,
  } = usePreferences();
  const today = todayInZone(timezone);
  const direction = weightGoalDirection({
    goal_mode: goalMode,
    goal_mode_custom_percentage: goalModeCustomPercentage,
    goal_mode_weekly_change_kg: goalModeWeeklyChangeKg,
  });
  const enabled = !isActingOnBehalf && direction !== 'none';
  const { data } = useRecentStandardMeasurements(
    addDays(today, -(PLATEAU_LOOKBACK_DAYS - 1)),
    today,
    enabled
  );

  const [dismissedState, setDismissedState] = useState(() => ({
    userId: activeUserId,
    end: readDismissed(activeUserId),
  }));
  const dismissedEnd =
    dismissedState.userId === activeUserId
      ? dismissedState.end
      : readDismissed(activeUserId);

  const plateau = useMemo(() => {
    if (!enabled || !data) return null;
    return detectWeightPlateau(
      data.flatMap((d) =>
        d.weight ? [{ date: d.entry_date, weight: Number(d.weight) }] : []
      ),
      direction,
      { today }
    );
  }, [enabled, data, direction, today]);

  const dismiss = useCallback(() => {
    if (!plateau || !activeUserId) return;
    try {
      window.localStorage.setItem(dismissedKey(activeUserId), plateau.endDate);
    } catch {
      // Storage full or blocked: the card still hides for this session.
    }
    setDismissedState({ userId: activeUserId, end: plateau.endDate });
  }, [plateau, activeUserId]);

  return {
    plateau:
      plateau && !isWeightPlateauDismissed(plateau, dismissedEnd)
        ? plateau
        : null,
    dismiss,
  };
}
