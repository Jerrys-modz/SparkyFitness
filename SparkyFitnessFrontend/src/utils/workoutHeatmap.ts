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

function weekStartsOnOf(firstDayOfWeek: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (((firstDayOfWeek % 7) + 7) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
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
  const weekStartsOn = weekStartsOnOf(options.firstDayOfWeek);
  const formatDay = options.formatDay ?? ymd;
  const monthLabel =
    options.monthLabel ??
    ((date: Date) => date.toLocaleString('default', { month: 'short' }));

  let rangeStart = parseDay(options.startDate) ?? subMonths(options.today, 12);
  let rangeEnd = parseDay(options.endDate) ?? options.today;
  let rangeStartKey = options.startDate ?? formatDay(rangeStart);
  let rangeEndKey = options.endDate ?? formatDay(rangeEnd);
  if (rangeStart > rangeEnd) {
    const swapDate = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = swapDate;
    const swapKey = rangeStartKey;
    rangeStartKey = rangeEndKey;
    rangeEndKey = swapKey;
  }

  const gridStart = startOfWeek(rangeStart, { weekStartsOn });
  const gridEnd = endOfWeek(rangeEnd, { weekStartsOn });
  const workoutSet = new Set(options.workoutDates);

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

// Day-string maths for the Reports workout heatmap (#2461): twelve calendar
// months ending with today's month, independent of the report's date filter.

const MONTHS_SHOWN = 12;

interface HeatmapMonth {
  year: number;
  /** 0-based month. */
  month: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const dayString = (year: number, month: number, day: number) =>
  `${year}-${pad2(month + 1)}-${pad2(day)}`;

export function heatmapMonthsEndingAt(today: string): HeatmapMonth[] {
  const [year, month] = today.split('-').map(Number);
  const months: HeatmapMonth[] = [];
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }
  return months;
}

/**
 * The fixed window the heatmap always covers: the first day of the month
 * eleven months back through `today` (a YYYY-MM-DD in the user's timezone).
 * Independent of the report's date filter (#2461).
 */
export function workoutHeatmapWindow(today: string): {
  start: string;
  end: string;
} {
  const first = heatmapMonthsEndingAt(today)[0];
  return {
    start: first ? dayString(first.year, first.month, 1) : today,
    end: today,
  };
}
