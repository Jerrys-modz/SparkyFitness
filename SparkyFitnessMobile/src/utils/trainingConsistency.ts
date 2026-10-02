import type { TrainingConsistency } from '@workspace/shared';
import { addDays } from '@workspace/shared';

export type CalendarCell = 'trained' | 'rest' | 'future';

export interface CalendarWeek {
  weekStart: string;
  /** Monday to Sunday. */
  cells: { day: string; state: CalendarCell }[];
}

/**
 * The heat-map grid: one column per week, Monday to Sunday down. Days after
 * `today` are `future` so the current week's tail is not drawn as missed.
 */
export function trainingCalendarWeeks(
  data: Pick<TrainingConsistency, 'today' | 'weeks' | 'trainingDays'>
): CalendarWeek[] {
  const trained = new Set(data.trainingDays);
  return data.weeks.map((week) => ({
    weekStart: week.weekStart,
    cells: Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(week.weekStart, offset);
      const state: CalendarCell =
        day > data.today ? 'future' : trained.has(day) ? 'trained' : 'rest';
      return { day, state };
    }),
  }));
}

export interface MuscleWeekRow {
  muscle: string;
  thisWeek: number;
  lastWeek: number;
}

/** Muscles trained this week or last, most sets this week first. */
export function muscleWeekRows(
  muscleSets: TrainingConsistency['muscleSets']
): MuscleWeekRow[] {
  const muscles = new Set([
    ...Object.keys(muscleSets.thisWeek),
    ...Object.keys(muscleSets.lastWeek),
  ]);
  return [...muscles]
    .map((muscle) => ({
      muscle,
      thisWeek: muscleSets.thisWeek[muscle] ?? 0,
      lastWeek: muscleSets.lastWeek[muscle] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.thisWeek - a.thisWeek ||
        b.lastWeek - a.lastWeek ||
        a.muscle.localeCompare(b.muscle)
    );
}
