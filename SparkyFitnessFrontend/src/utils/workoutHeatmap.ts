import { eachDayOfInterval, endOfWeek, startOfWeek, subMonths } from 'date-fns';

export const HEATMAP_WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type HeatmapWeekdayKey = (typeof HEATMAP_WEEKDAY_KEYS)[number];

export interface HeatmapDayCell {
  date: Date;
  dayKey: string;
  hasWorkout: boolean;
  inRange: boolean;
}

export interface HeatmapWeek {
  monthLabel: string | null;
  days: HeatmapDayCell[];
}

export interface WorkoutContributionGrid {
  weekdayKeys: HeatmapWeekdayKey[];
  weeks: HeatmapWeek[];
}

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDay(day: string | null | undefined): Date | null {
  if (!day) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Contribution grid over the selected report range (falls back to the last
 * 12 months). Weeks are columns, weekdays are rows, no per-day numbers.
 * `firstDayOfWeek` is 0=Sun … 6=Sat.
 */
export function buildWorkoutContributionGrid(options: {
  workoutDates: string[];
  today: Date;
  firstDayOfWeek: number;
  startDate?: string | null;
  endDate?: string | null;
  formatDay?: (date: Date) => string;
  monthLabel?: (date: Date) => string;
}): WorkoutContributionGrid {
  const weekStartsOn = (((options.firstDayOfWeek % 7) + 7) % 7) as
    0 | 1 | 2 | 3 | 4 | 5 | 6;
  const formatDay = options.formatDay ?? ymd;
  const monthLabel =
    options.monthLabel ??
    ((date: Date) => date.toLocaleString('default', { month: 'short' }));

  let rangeStart = parseDay(options.startDate) ?? subMonths(options.today, 12);
  let rangeEnd = parseDay(options.endDate) ?? options.today;
  if (rangeStart > rangeEnd) {
    const swap = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = swap;
  }

  const gridStart = startOfWeek(rangeStart, { weekStartsOn });
  const gridEnd = endOfWeek(rangeEnd, { weekStartsOn });
  const workoutSet = new Set(options.workoutDates);
  const rangeStartKey = formatDay(rangeStart);
  const rangeEndKey = formatDay(rangeEnd);

  const weekdayKeys = [
    ...HEATMAP_WEEKDAY_KEYS.slice(weekStartsOn),
    ...HEATMAP_WEEKDAY_KEYS.slice(0, weekStartsOn),
  ] as HeatmapWeekdayKey[];

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: HeatmapWeek[] = [];

  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7).map((date) => {
      const dayKey = formatDay(date);
      return {
        date,
        dayKey,
        hasWorkout: workoutSet.has(dayKey),
        inRange: dayKey >= rangeStartKey && dayKey <= rangeEndKey,
      };
    });
    const firstOfMonth = weekDays.find((cell) => cell.date.getDate() === 1);
    const firstInRange = weekDays.find((cell) => cell.inRange);
    const labelDate =
      firstOfMonth?.date ?? (i === 0 ? firstInRange?.date : undefined);
    weeks.push({
      monthLabel: labelDate ? monthLabel(labelDate) : null,
      days: weekDays,
    });
  }

  return { weekdayKeys, weeks };
}
