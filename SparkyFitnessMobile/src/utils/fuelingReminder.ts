/** Upper bound on pending fueling reminders; iOS caps an app at 64 pending notifications. */
export const MAX_SCHEDULED_FUELING_REMINDERS = 30;

/** A reminder due right now fires this long from now rather than in the past. */
export const MIN_FUELING_LEAD_MS = 5_000;

export interface FuelingReminderTimesInput {
  startAt: Date;
  /** Minutes after the start of each reminder, from the shared fueling plan. */
  offsetsMin: readonly number[];
  now: Date;
}

/**
 * The moments to remind, as dates. Offsets already behind `now` are dropped
 * (the run started earlier than the plan was saved), and the list is capped so
 * a very long plan cannot crowd out the other reminders the app schedules.
 */
export function fuelingReminderTimes({
  startAt,
  offsetsMin,
  now,
}: FuelingReminderTimesInput): Date[] {
  const startMs = startAt.getTime();
  if (Number.isNaN(startMs)) return [];
  const earliestMs = now.getTime() + MIN_FUELING_LEAD_MS;

  return [...offsetsMin]
    .filter((offset) => Number.isFinite(offset) && offset >= 0)
    .sort((a, b) => a - b)
    .map((offset) => new Date(startMs + offset * 60_000))
    .filter((time) => time.getTime() >= earliestMs)
    .slice(0, MAX_SCHEDULED_FUELING_REMINDERS);
}
