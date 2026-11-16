import {
  WEEKLY_CALORIE_BUDGET_DEFAULT_SHIFT_PERCENT,
  WEEKLY_CALORIE_BUDGET_MAX_SHIFT_PERCENT,
  WEEKLY_CALORIE_BUDGET_MIN_SHIFT_PERCENT,
} from '../constants/calorieConstants.ts';
import type { WeeklyCalorieBudgetDay } from '../schemas/api/DailySummary.api.zod.ts';
import { addDays, compareDays } from './timezone.ts';
import { weekStartOf } from './trainingConsistency.ts';

/**
 * Weekly calorie budget. Pure, so the server applies it to each day's goal and
 * the tests pin the maths without a database.
 *
 * The week's budget is the sum of that week's daily targets. A day's target
 * becomes its own target plus the carryover of the completed days before it
 * in the same week (what they allowed minus what was eaten), spread evenly
 * over the days left in the week, today included. The change is capped at
 * `maxShiftPercent` of the day's own target and never takes the day below the
 * safety floor.
 *
 * Only completed days count: a day before `today` and before the day being
 * worked out, on which the budget was switched on, with food logged. A day
 * with nothing logged is treated as on target, so a forgotten log never
 * raises the rest of the week. Days before the budget was switched on are not
 * part of the week's budget at all, so turning it on midweek starts clean.
 * Carryover never crosses into the next week.
 */

/** One earlier day of the week, as the budget sees it. */
export interface WeeklyBudgetLedgerDay {
  /** YYYY-MM-DD. */
  date: string;
  /** The budget was switched on that day. */
  budgeted: boolean;
  /**
   * What the day allowed: its own target before the weekly budget moved it,
   * plus any exercise calories its adjustment mode credited (so a workout is
   * counted once, on its own day).
   */
  allowance: number;
  /** Calories logged that day, or null when nothing was logged. */
  eaten: number | null;
}

export interface WeeklyBudgetDayInput {
  /** The day being worked out, YYYY-MM-DD. */
  date: string;
  /** Today in the person's timezone, YYYY-MM-DD. Days from today on are open. */
  today: string;
  /** 0 = Sunday ... 6 = Saturday. */
  firstDayOfWeek: number;
  /** The day's target before the weekly budget (after cycling and plans). */
  baseTarget: number;
  /** The day's safety floor, or null when the floor is switched off. */
  floor: number | null;
  /** Largest change either way, % of `baseTarget`. */
  maxShiftPercent: number;
  /** Earlier days; any outside this day's week or not completed are ignored. */
  ledger: readonly WeeklyBudgetLedgerDay[];
}

/** A stored or requested cap as a usable whole percentage. */
export function normalizeWeeklyBudgetShiftPercent(value: unknown): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) {
    return WEEKLY_CALORIE_BUDGET_DEFAULT_SHIFT_PERCENT;
  }
  return Math.min(
    WEEKLY_CALORIE_BUDGET_MAX_SHIFT_PERCENT,
    Math.max(WEEKLY_CALORIE_BUDGET_MIN_SHIFT_PERCENT, number)
  );
}

/** The first and last day of the week holding `day`. */
export function weeklyBudgetWeek(
  day: string,
  firstDayOfWeek: number
): { weekStart: string; weekEnd: string } {
  const start = Number.isInteger(firstDayOfWeek)
    ? ((firstDayOfWeek % 7) + 7) % 7
    : 0;
  const weekStart = weekStartOf(day, start);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

function daysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = from; compareDays(day, to) < 0; day = addDays(day, 1)) {
    count += 1;
    if (count > 7) break;
  }
  return count;
}

export function weeklyBudgetDayTarget(
  input: WeeklyBudgetDayInput
): WeeklyCalorieBudgetDay {
  const { weekStart, weekEnd } = weeklyBudgetWeek(
    input.date,
    input.firstDayOfWeek
  );
  const daysLeft = daysBetween(input.date, weekEnd) + 1;
  const baseTarget = Math.round(input.baseTarget);
  const maxShiftPercent = normalizeWeeklyBudgetShiftPercent(
    input.maxShiftPercent
  );
  const maxShift = Math.max(
    0,
    Math.round((baseTarget * maxShiftPercent) / 100)
  );
  const floor =
    input.floor !== null && Number.isFinite(input.floor)
      ? Math.round(input.floor)
      : null;

  let allowanceSoFar = 0;
  let eatenSoFar = 0;
  let countedDays = 0;
  let unloggedDays = 0;
  const seen = new Set<string>();
  for (const day of input.ledger) {
    if (seen.has(day.date)) continue;
    const completed =
      compareDays(day.date, input.date) < 0 &&
      compareDays(day.date, input.today) < 0;
    const inWeek = compareDays(day.date, weekStart) >= 0;
    if (!completed || !inWeek || !day.budgeted) continue;
    seen.add(day.date);
    if (
      day.eaten === null ||
      !Number.isFinite(day.eaten) ||
      day.eaten <= 0 ||
      !Number.isFinite(day.allowance)
    ) {
      unloggedDays += 1;
      continue;
    }
    countedDays += 1;
    allowanceSoFar += day.allowance;
    eatenSoFar += day.eaten;
  }
  allowanceSoFar = Math.round(allowanceSoFar);
  eatenSoFar = Math.round(eatenSoFar);
  const carryover = allowanceSoFar - eatenSoFar;

  const uncappedShift = baseTarget > 0 ? Math.round(carryover / daysLeft) : 0;
  let shift = Math.max(-maxShift, Math.min(maxShift, uncappedShift));
  let limitedBy: WeeklyCalorieBudgetDay['limitedBy'] =
    shift !== uncappedShift ? 'cap' : 'none';

  // Never below the safety floor; a day already under it is never lowered.
  const lowest = Math.max(0, floor === null ? 0 : Math.min(floor, baseTarget));
  if (shift < 0 && baseTarget + shift < lowest) {
    shift = lowest - baseTarget;
    limitedBy = 'floor';
  }
  const target = baseTarget + shift;

  return {
    weekStart,
    weekEnd,
    daysLeft,
    baseTarget,
    target,
    shift,
    uncappedShift,
    limitedBy,
    maxShift,
    maxShiftPercent,
    floor,
    carryover,
    allowanceSoFar,
    eatenSoFar,
    countedDays,
    unloggedDays,
    weekBudget: allowanceSoFar + baseTarget * daysLeft,
  };
}
