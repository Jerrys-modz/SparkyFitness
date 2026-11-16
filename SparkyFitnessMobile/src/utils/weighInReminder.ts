// Only `@workspace/shared` here: the preferences store imports this file, and
// `./dateUtils` reaches the store through the localization module.
import { addDays } from '@workspace/shared';

/** `data.kind` carried by every weigh-in reminder notification. */
export const WEIGH_IN_REMINDER_KIND = 'weigh-in';
export const DEFAULT_WEIGH_IN_REMINDER_TIME = '07:30';
/** Day-of-week indices, 0 = Sunday … 6 = Saturday. Default: every day. */
export const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
/**
 * Reminders are one-shot notifications for the next days, not a repeating
 * trigger, so today's can be left out once a weight is logged. The window is
 * rolled forward whenever the app opens or background sync runs; iOS keeps only
 * the 64 soonest pending notifications, so it stays short.
 */
export const WEIGH_IN_REMINDER_LOOKAHEAD_DAYS = 7;

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

export interface WeighInReminderSlot {
  /** Days from today, 0 = today; unique within one schedule. */
  offset: number;
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** When the reminder fires, in device-local time. */
  at: Date;
}

/**
 * The reminders to schedule from `now`: one per selected weekday over the
 * lookahead window, at `time`, skipping times already past and `skipDay` (today
 * once a weight is logged).
 */
export function computeWeighInReminderSlots({
  now,
  today,
  time,
  weekdays,
  skipDay,
  lookaheadDays = WEIGH_IN_REMINDER_LOOKAHEAD_DAYS,
}: {
  now: Date;
  /** `now`'s local calendar day, `YYYY-MM-DD`. */
  today: string;
  time: string;
  weekdays: readonly number[];
  skipDay: string | null;
  lookaheadDays?: number;
}): WeighInReminderSlot[] {
  const [hour, minute] = normalizeWeighInReminderTime(time)
    .split(':')
    .map(Number);
  const selected = new Set(normalizeWeighInReminderWeekdays(weekdays));
  const slots: WeighInReminderSlot[] = [];
  for (let offset = 0; offset < lookaheadDays; offset++) {
    const day = addDays(today, offset);
    if (day === skipDay) continue;
    const [year, month, date] = day.split('-').map(Number);
    const at = new Date(year, month - 1, date, hour, minute);
    if (!selected.has(at.getDay())) continue;
    if (at.getTime() <= now.getTime()) continue;
    slots.push({ offset, day, at });
  }
  return slots;
}
