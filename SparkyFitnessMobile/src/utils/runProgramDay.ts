import type { ProgramStatus } from '@workspace/shared';

export type ProgramDayCard = 'scheduled' | 'upNext';

/**
 * Whether the Diary shows the training program's workout for `date`, and how
 * it is described. It shows only for today, while a program is on and not
 * finished, and not once a program workout has been done today. With run days
 * chosen it shows on those days ("scheduled"); with none it shows every day
 * the next workout is due ("up next").
 */
export function programDayCard({
  enabled,
  status,
  runDays,
  doneDay,
  today,
  date,
}: {
  enabled: boolean;
  status: ProgramStatus | null;
  /** Chosen run days, 0 = Sunday. */
  runDays: readonly number[];
  /** The local day a program workout was last completed. */
  doneDay: string | null;
  /** Today, as YYYY-MM-DD. */
  today: string;
  /** The day the Diary is showing. */
  date: string;
}): ProgramDayCard | null {
  if (date !== today) return null;
  if (!enabled || !status || status.finished || !status.workout) return null;
  if (doneDay === today) return null;
  if (runDays.length === 0) return 'upNext';
  const [year, month, day] = today.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return runDays.includes(weekday) ? 'scheduled' : null;
}
