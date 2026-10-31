/** One reminder: log `mealTypeId` around `time` (zero-padded local `HH:MM`). */
export interface MealReminder {
  mealTypeId: string;
  time: string;
}

export const MAX_MEAL_REMINDERS = 8;
/** Days scheduled ahead (today included), so reminders still fire if the app is not opened. */
export const MEAL_REMINDER_LOOKAHEAD_DAYS = 3;
/** `data.kind` carried by every meal reminder notification. */
export const MEAL_REMINDER_KIND = 'meal-reminder';
/** Same grace as hydration: a reminder due within a minute is not worth scheduling. */
export const MEAL_REMINDER_MIN_LEAD_MS = 60_000;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Keeps valid reminders only: a non-empty meal type, a zero-padded `HH:MM`
 * time, one reminder per meal type (the first wins), sorted by time and capped
 * at MAX_MEAL_REMINDERS.
 */
export function normalizeMealReminders(
  reminders: readonly MealReminder[]
): MealReminder[] {
  const seen = new Set<string>();
  const valid: MealReminder[] = [];
  for (const reminder of reminders) {
    if (
      typeof reminder?.mealTypeId !== 'string' ||
      reminder.mealTypeId.length === 0 ||
      !TIME_PATTERN.test(reminder.time) ||
      seen.has(reminder.mealTypeId)
    ) {
      continue;
    }
    seen.add(reminder.mealTypeId);
    valid.push({ mealTypeId: reminder.mealTypeId, time: reminder.time });
  }
  return valid
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, MAX_MEAL_REMINDERS);
}

export interface ScheduledMealReminder {
  mealTypeId: string;
  date: Date;
}

export interface ComputeMealReminderScheduleInput {
  reminders: readonly MealReminder[];
  /** Meal types with at least one entry logged today. */
  loggedMealTypeIds: ReadonlySet<string>;
  now: Date;
}

function atLocalTime(base: Date, dayOffset: number, time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  // `new Date(y, m, d + n, h, mi)` lets the platform resolve DST, so a
  // reminder stays at its wall-clock time across a clock change.
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    hour,
    minute,
    0,
    0
  );
}

/**
 * The notifications to have pending: today's not-yet-due reminders for meals
 * that are still unlogged, then every reminder for the following days (nothing
 * can be logged for those yet). Sorted by time.
 */
export function computeMealReminderSchedule({
  reminders,
  loggedMealTypeIds,
  now,
}: ComputeMealReminderScheduleInput): ScheduledMealReminder[] {
  const normalized = normalizeMealReminders(reminders);
  const earliest = now.getTime() + MEAL_REMINDER_MIN_LEAD_MS;
  const out: ScheduledMealReminder[] = [];
  for (let day = 0; day < MEAL_REMINDER_LOOKAHEAD_DAYS; day++) {
    for (const { mealTypeId, time } of normalized) {
      if (day === 0 && loggedMealTypeIds.has(mealTypeId)) continue;
      const date = atLocalTime(now, day, time);
      if (date.getTime() < earliest) continue;
      out.push({ mealTypeId, date });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
