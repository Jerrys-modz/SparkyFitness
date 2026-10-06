import { addDays, type HabitLog } from '@workspace/shared';

// Consecutive completed days ending on `date`. A not-yet-completed `date`
// doesn't break the streak; it counts from the day before.
export function computeStreak(
  logs: HabitLog[],
  habitId: string,
  date: string
): number {
  const done = new Set(
    logs
      .filter((l) => l.habit_id === habitId && l.completed)
      .map((l) => l.entry_date)
  );
  let cursor = done.has(date) ? date : addDays(date, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
