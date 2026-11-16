// Only `@workspace/shared` here: the preferences store imports this file, and
// `./dateUtils` reaches the store through the localization module.
import { addDays } from '@workspace/shared';

/** `data.kind` carried by every weigh-in reminder notification. */
export const WEIGH_IN_REMINDER_KIND = 'weigh-in';
export const DEFAULT_WEIGH_IN_REMINDER_TIME = '07:30';
/** Day-of-week indices, 0 = Sunday … 6 = Saturday. Default: every day. */
export const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
/**
 * When today's reminder is skipped, today's weekday loses its repeating
 * trigger (a repeating trigger cannot skip one occurrence) and gets one-shot
 * reminders for this many following weeks instead. The next reconcile on
 * another day (app open, background sync) restores the repeating trigger, so
 * this only bounds how long that weekday keeps reminding with neither.
 */
export const WEIGH_IN_SKIP_FALLBACK_WEEKS = 8;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A valid zero-padded `HH:MM`, else the default time. */
export function normalizeWeighInReminderTime(time: string): string {
  return TIME_PATTERN.test(time) ? time : DEFAULT_WEIGH_IN_REMINDER_TIME;
}

/** Valid day-of-week indices, de-duplicated and sorted. May be empty. */
export function normalizeWeighInReminderWeekdays(
  days: readonly number[]
): number[] {
  return [
    ...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort((a, b) => a - b);
}

/** Weekday of a `YYYY-MM-DD` calendar day, 0 = Sunday. */
function weekdayOfCalendarDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getDay();
}

export interface WeighInReminderPlan {
  hour: number;
  minute: number;
  /** Weekdays (0 = Sunday) that get a repeating weekly trigger. */
  weekly: number[];
  /** One-shot reminders standing in for today's weekday after a skip. */
  oneShots: { week: number; day: string; at: Date }[];
}

/**
 * What to schedule: a repeating weekly reminder per selected weekday, except
 * that when `skipToday` is set (a weight is logged for today) today's weekday
 * gets one-shot reminders on the same weekday of the following weeks instead,
 * so today's is left out without stopping the later ones.
 */
export function planWeighInReminders({
  today,
  time,
  weekdays,
  skipToday,
  fallbackWeeks = WEIGH_IN_SKIP_FALLBACK_WEEKS,
}: {
  /** The device's local calendar day, `YYYY-MM-DD`. */
  today: string;
  time: string;
  weekdays: readonly number[];
  skipToday: boolean;
  fallbackWeeks?: number;
}): WeighInReminderPlan {
  const [hour, minute] = normalizeWeighInReminderTime(time)
    .split(':')
    .map(Number);
  const selected = normalizeWeighInReminderWeekdays(weekdays);
  const todayWeekday = weekdayOfCalendarDay(today);
  const skipping = skipToday && selected.includes(todayWeekday);
  const oneShots: WeighInReminderPlan['oneShots'] = [];
  if (skipping) {
    for (let week = 1; week <= fallbackWeeks; week++) {
      const day = addDays(today, week * 7);
      const [year, month, date] = day.split('-').map(Number);
      oneShots.push({
        week,
        day,
        at: new Date(year, month - 1, date, hour, minute),
      });
    }
  }
  return {
    hour,
    minute,
    weekly: skipping ? selected.filter((d) => d !== todayWeekday) : selected,
    oneShots,
  };
}
