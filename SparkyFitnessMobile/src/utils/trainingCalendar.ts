import type {
  CompletedItem,
  LoadBySport,
  LoadSportGroup,
  PlannedItem,
  PlannedStatus,
  TrainingCalendarResponse,
} from '@workspace/shared';
import {
  LOAD_SPORT_GROUPS,
  addDays,
  buildMonthGrid,
  weekStartOf,
} from '@workspace/shared';

/** Weeks of load per sport the load card draws. */
export const SPORT_LOAD_WEEKS = 8;

export const SPORT_COLORS: Record<LoadSportGroup, string> = {
  running: '#e4572e',
  cycling: '#2e86ab',
  walking: '#58a55c',
  strength: '#7b5ea7',
  other: '#8a8f98',
};

/**
 * Work nothing was planned for. Not a status colour and not a sport colour, so
 * the calendar reads one way throughout: colours mean done / partly / missed /
 * upcoming, and this outline means extra.
 */
export const EXTRA_COLOR = '#5b8def';

export const STATUS_COLORS: Record<PlannedStatus, string> = {
  done: '#3d9a50',
  partial: '#e0a030',
  missed: '#d6453d',
  upcoming: '#8a8f98',
};

/**
 * The range the load card asks for: eight full weeks and the current month fit
 * inside the 62 days before today, whatever day the week starts on.
 */
export function sportLoadRange(today: string): { start: string; end: string } {
  return { start: addDays(today, -(SPORT_LOAD_WEEKS * 7 + 6)), end: today };
}

/** The grid of a month (`YYYY-MM`) from the week's first day, as the server is asked for it. */
export function monthRange(month: string, firstDayOfWeek: number) {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const grid = buildMonthGrid(year, m, firstDayOfWeek);
  return { start: grid.gridStart, end: grid.gridEnd, days: grid.days };
}

/** The seven days of the week that holds `day`. */
export function weekDays(day: string, firstDayOfWeek: number): string[] {
  const start = weekStartOf(day, firstDayOfWeek);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface DayItems {
  planned: PlannedItem[];
  completed: CompletedItem[];
}

export function itemsByDay(
  data: TrainingCalendarResponse | undefined
): Map<string, DayItems> {
  const days = new Map<string, DayItems>();
  const at = (day: string) => {
    const found = days.get(day);
    if (found) return found;
    const created: DayItems = { planned: [], completed: [] };
    days.set(day, created);
    return created;
  };
  for (const item of data?.planned ?? []) at(item.day).planned.push(item);
  for (const item of data?.completed ?? []) at(item.day).completed.push(item);
  return days;
}

export interface SportShare {
  sport: LoadSportGroup;
  load: number;
  /** 0 to 1 of the total. */
  share: number;
}

/** Sports with load, biggest first, each with its share of the total. */
export function sportShares(bySport: LoadBySport | undefined): SportShare[] {
  if (!bySport) return [];
  const total = LOAD_SPORT_GROUPS.reduce(
    (sum, s) => sum + (bySport[s] ?? 0),
    0
  );
  if (total <= 0) return [];
  return LOAD_SPORT_GROUPS.map((sport) => ({
    sport,
    load: bySport[sport] ?? 0,
    share: (bySport[sport] ?? 0) / total,
  }))
    .filter((entry) => entry.load > 0)
    .sort((a, b) => b.load - a.load);
}

/** The load split of the week and the month that hold `today`. */
export function currentSplits(
  data: TrainingCalendarResponse | undefined,
  today: string
): { week: LoadBySport | undefined; month: LoadBySport | undefined } {
  const weeks = data?.sportLoad.weeks ?? [];
  const week = [...weeks].reverse().find((w) => w.start <= today);
  const month = data?.sportLoad.months.find(
    (m) => m.month === today.slice(0, 7)
  );
  return { week: week?.bySport, month: month?.bySport };
}
