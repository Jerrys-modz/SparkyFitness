/** Hour of the day (local) the weekly check-in notification arrives. */
export const COACHING_REMINDER_HOUR = 9;

/**
 * The next local `hour` on the given weekday (0 = Sunday), strictly after `now`.
 * Built from calendar fields so a daylight-saving change does not shift it.
 */
export function nextCoachingReminderTime(
  now: Date,
  weekday: number,
  hour: number = COACHING_REMINDER_HOUR
): Date {
  const ahead = (weekday - now.getDay() + 7) % 7;
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + ahead,
    hour
  );
  if (candidate.getTime() > now.getTime()) return candidate;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + ahead + 7,
    hour
  );
}

/** Marks a suggestion the person postponed, so the same one is not pushed again. */
export function coachingSuggestionSignature(
  asOf: string,
  calories: number
): string {
  return `${asOf}:${calories}`;
}
