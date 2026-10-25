import type {
  CalendarWeekTotals,
  CompletedItem,
  LoadBySport,
  LoadSportGroup,
  PlannedItem,
  PlannedStatus,
  TrainingCalendarResponse,
} from '@workspace/shared';
import type { IconName } from '../components/Icon';
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
  cardio: '#2a9d8f',
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

/** Most marks drawn on a day before "+N". */
export const MAX_DAY_MARKS = 3;
/** Past weeks listed before "Show earlier weeks". */
export const RECENT_PAST_WEEKS = 2;
/** How far ahead an empty day still reads as a rest day. */
export const REST_DAY_AHEAD_DAYS = 14;

export const SPORT_ICONS: Record<LoadSportGroup, IconName> = {
  running: 'exercise-running',
  cycling: 'exercise-cycling',
  walking: 'exercise-walking',
  cardio: 'exercise-stair',
  strength: 'exercise-weights',
  other: 'exercise',
};

export interface DayMark {
  key: string;
  sport: LoadSportGroup;
  /** A planned item's status, or `extra` for work nothing was planned for. */
  status: PlannedStatus | 'extra';
}

/** What a day's cell draws: planned items first, then unplanned work. */
export function dayMarks(items: DayItems): DayMark[] {
  return [
    ...items.planned.map((item): DayMark => ({
      key: item.id,
      sport: item.sport,
      status: item.status,
    })),
    ...items.completed
      .filter((item) => item.plannedItemId === null)
      .map((item): DayMark => ({
        key: item.id,
        sport: item.sport,
        status: 'extra',
      })),
  ];
}

export interface WeekSummary {
  /** Planned sessions done (or partly done), or every session when none were planned. */
  done: number;
  planned: number;
}

/** The small total at the end of a week's row; null for a week with nothing. */
export function weekSummary(
  week: CalendarWeekTotals | undefined
): WeekSummary | null {
  if (!week) return null;
  if (week.plannedSessions > 0) {
    return {
      done: week.doneSessions + week.partialSessions,
      planned: week.plannedSessions,
    };
  }
  return week.completedSessions > 0
    ? { done: week.completedSessions, planned: 0 }
    : null;
}

/**
 * The weeks as the list shows them: the week that holds today first (else the
 * latest week before it, else the first), then the most recent weeks before it,
 * then the weeks ahead. Older past weeks come back apart, to be collapsed.
 */
export function orderWeeks(
  weeks: readonly CalendarWeekTotals[],
  today: string
): { visible: CalendarWeekTotals[]; earlier: CalendarWeekTotals[] } {
  const sorted = [...weeks].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0) return { visible: [], earlier: [] };
  let pivot = -1;
  sorted.forEach((w, i) => {
    if (w.start <= today) pivot = i;
  });
  if (pivot < 0) pivot = 0;
  const past = sorted.slice(0, pivot).reverse();
  return {
    visible: [
      sorted[pivot]!,
      ...past.slice(0, RECENT_PAST_WEEKS),
      ...sorted.slice(pivot + 1),
    ],
    earlier: past.slice(RECENT_PAST_WEEKS),
  };
}

/** Segment sizes (sessions) for a week's progress bar. */
export function weekProgress(week: CalendarWeekTotals) {
  const planned = week.plannedSessions;
  const done = Math.min(week.doneSessions, planned);
  const partial = Math.min(week.partialSessions, planned - done);
  const missed = Math.min(week.missedSessions, planned - done - partial);
  return {
    planned,
    done,
    partial,
    missed,
    rest: planned - done - partial - missed,
  };
}
