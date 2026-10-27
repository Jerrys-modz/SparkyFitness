import { addDays, compareDays, daysBetween, isDayString } from './timezone.ts';

/** Where the build-up starts: the low end of what most runners take without trouble. */
export const GUT_TRAINING_START_CARBS = 30;
/** The target is reached this many days before the race and then held. */
export const GUT_TRAINING_HOLD_DAYS = 14;
/** The longest build-up shown; with more time, the early weeks stay at the start. */
export const GUT_TRAINING_MAX_WEEKS = 16;

export type GutTrainingStatus =
  /** The build-up has not begun; stay at the starting amount. */
  | 'not_started'
  | 'ramping'
  /** The target is reached; practise it until the race. */
  | 'holding'
  /** Under three weeks to the race: not enough time to build up. */
  | 'short';

export interface GutTrainingWeek {
  /** `YYYY-MM-DD` the week's amount applies from. */
  startDay: string;
  carbsPerHour: number;
}

export interface GutTrainingRamp {
  status: GutTrainingStatus;
  daysToRace: number;
  startCarbsPerHour: number;
  targetCarbsPerHour: number;
  /** What to practise at today, in grams of carbohydrate per hour. */
  currentCarbsPerHour: number;
  /** Day the first step up begins; null when there is no build-up. */
  rampStartDay: string | null;
  /** The weekly steps, ending with the day the target starts being held. */
  weeks: GutTrainingWeek[];
}

export interface GutTrainingInput {
  /** `YYYY-MM-DD` in the person's day. */
  today: string;
  raceDay: string;
  targetCarbsPerHour: number;
  startCarbsPerHour?: number;
  /**
   * The day the build-up begins (or began). Keep it the same between visits:
   * the weeks are counted from it, so a start that moves with today would
   * restart the build-up every day. Defaults to today; a later day is today.
   */
  startDay?: string;
}

const roundToFive = (value: number) => Math.round(value / 5) * 5;

/**
 * A gradual build-up of carbohydrate per hour across the training block, ending
 * at the race target two weeks before the race. A gut that has not practised
 * a high intake is the usual reason fueling goes wrong on the day, so the
 * amount rises in even weekly steps and the last two weeks hold the target.
 * Null when there is no race ahead or no target to build toward.
 */
export function buildGutTrainingRamp(
  input: GutTrainingInput
): GutTrainingRamp | null {
  const { today, raceDay } = input;
  if (!isDayString(today) || !isDayString(raceDay)) return null;
  const daysToRace = daysBetween(today, raceDay);
  if (daysToRace <= 0) return null;

  const target = roundToFive(input.targetCarbsPerHour);
  if (!(target > 0)) return null;
  const start = Math.min(
    roundToFive(input.startCarbsPerHour ?? GUT_TRAINING_START_CARBS),
    target
  );

  const base = {
    daysToRace,
    startCarbsPerHour: start,
    targetCarbsPerHour: target,
  };

  const holdStartDay = addDays(raceDay, -GUT_TRAINING_HOLD_DAYS);
  const beginDay =
    input.startDay && isDayString(input.startDay) && input.startDay < today
      ? input.startDay
      : today;
  const weekCount = Math.min(
    Math.floor(daysBetween(beginDay, holdStartDay) / 7),
    GUT_TRAINING_MAX_WEEKS
  );
  if (target === start || weekCount < 1) {
    return {
      ...base,
      status: weekCount < 1 && target > start ? 'short' : 'holding',
      currentCarbsPerHour: start,
      rampStartDay: null,
      weeks: [],
    };
  }

  const rampStartDay = addDays(holdStartDay, -7 * weekCount);
  const weeks: GutTrainingWeek[] = [];
  for (let i = 0; i < weekCount; i++) {
    weeks.push({
      startDay: addDays(rampStartDay, 7 * i),
      carbsPerHour: roundToFive(
        start + ((target - start) * (i + 1)) / weekCount
      ),
    });
  }
  weeks.push({ startDay: holdStartDay, carbsPerHour: target });

  let current = start;
  for (const week of weeks) {
    if (compareDays(week.startDay, today) <= 0) current = week.carbsPerHour;
  }

  const status: GutTrainingStatus =
    compareDays(today, rampStartDay) < 0
      ? 'not_started'
      : compareDays(today, holdStartDay) >= 0
        ? 'holding'
        : 'ramping';

  return {
    ...base,
    status,
    currentCarbsPerHour: current,
    rampStartDay,
    weeks,
  };
}
