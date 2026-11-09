import type { SleepEntry } from '../types/sleep';
import { addDays } from './dateUtils';
import { streaksFromLoggedFlags } from './nutritionReport';

/** How far back the widget's logging streak looks. Longer streaks read as this. */
export const WIDGET_STREAK_WINDOW_DAYS = 90;

/**
 * The current logging streak for the widget: consecutive days with calories
 * logged, ending today (an empty today does not break it, as in the Nutrition
 * report). `points` may skip days; a missing day counts as not logged.
 */
export function currentLoggingStreak(
  points: readonly { date: string; calories: number }[],
  endDate: string,
  days: number = WIDGET_STREAK_WINDOW_DAYS
): number {
  const loggedDays = new Set(
    points.filter((point) => point.calories > 0).map((point) => point.date)
  );
  const startDate = addDays(endDate, -(days - 1));
  const flags = Array.from({ length: days }, (_, index) =>
    loggedDays.has(addDays(startDate, index))
  );
  return streaksFromLoggedFlags(flags).current;
}

/**
 * Minutes asleep for the widget: time actually asleep when the source reports
 * it, else the bed-to-wake span. Null when there is no sleep.
 */
export function sleepMinutesForWidget(
  entry: Pick<
    SleepEntry,
    'time_asleep_in_seconds' | 'duration_in_seconds'
  > | null
): number | null {
  if (!entry) return null;
  const seconds =
    entry.time_asleep_in_seconds && entry.time_asleep_in_seconds > 0
      ? entry.time_asleep_in_seconds
      : entry.duration_in_seconds;
  return seconds > 0 ? Math.round(seconds / 60) : null;
}
