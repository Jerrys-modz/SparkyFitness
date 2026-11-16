import { ENERGY_DENSITY_KCAL_PER_KG } from '../constants/calorieConstants.ts';
import {
  getGoalModeAdjustment,
  weeklyChangeSafetyZone,
  type WeeklyChangeSafetyZone,
} from './calorieCalculations.ts';
import { addDays, compareDays, daysBetween } from './timezone.ts';

// A goal weight with a target date the person chose. The date never changes
// calories by itself: this works out the pace the date needs, compares it with
// the pace the current calorie setting gives (whatever its mode), and returns
// what the apps offer. All weights are kilograms; days are YYYY-MM-DD strings.

/** Within this many kg of the goal, the goal counts as reached. */
export const GOAL_WEIGHT_REACHED_TOLERANCE_KG = 0.2;
/** The setting's pace may fall this share short of the required pace and still be on course. */
export const GOAL_WEIGHT_PACE_SHORT_TOLERANCE = 0.1;
/** Beyond this share over the required pace, a gentler pace is offered. */
export const GOAL_WEIGHT_PACE_OVER_TOLERANCE = 0.25;
/** A setting pace smaller than this, kg a week, is treated as holding steady. */
export const GOAL_WEIGHT_STEADY_KG_PER_WEEK = 0.05;
/** High cut is offered when its pace is within this share of the required pace. */
export const GOAL_WEIGHT_HIGH_CUT_MATCH = 0.1;
/** Earliest dates further out than this are not shown. */
const MAX_EARLIEST_DAYS = 730;

export type GoalWeightPlanStatus =
  /** The trend has reached the goal. */
  | 'reached'
  /** The target date is today or earlier and the goal is not reached. */
  | 'date_passed'
  /** The calorie setting's pace meets the date. */
  | 'on_course'
  /** The setting is too slow for the date. */
  | 'needs_faster'
  /** The setting is much faster than the date needs. */
  | 'needs_slower'
  /** The setting holds steady or moves away from the goal. */
  | 'wrong_direction'
  /** There is no calorie setting pace to compare (no maintenance estimate or calorie goal). */
  | 'no_setting';

export interface GoalWeightPlanInput {
  today: string;
  targetDate: string;
  goalKg: number;
  /** Current smoothed (trend) weight. */
  currentKg: number;
  /** Trend weight on the day the goal or date was set, when known. */
  startKg?: number | null;
  /** Day the goal or date was set, when known. */
  setOn?: string | null;
  /** Signed kg a week the saved calorie goal gives at the current maintenance. */
  settingKgPerWeek: number | null;
  /** Maintenance estimate (kcal a day), when known. */
  maintenanceKcal: number | null;
  /**
   * The calorie floor to judge the pace against: the person's effective safety
   * floor when one is enforced, otherwise the standard floor as advice. Null
   * when unknown.
   */
  floorKcal: number | null;
  /**
   * Whether the calorie engine really holds the target at `floorKcal`. False
   * when the person turned the floor off: the pace is then still warned about
   * but is reachable. Defaults to true.
   */
  floorEnforced?: boolean;
}

export interface GoalWeightSchedule {
  /** Where the straight path from the start to the goal on the date is today. */
  plannedKg: number;
  /** Positive is ahead of the path, negative behind, in days. */
  daysAhead: number;
}

export interface GoalWeightPlan {
  status: GoalWeightPlanStatus;
  /** Days from today to the target date; zero or less once it has passed. */
  daysLeft: number;
  /** Signed kg still to change (goal minus current). */
  remainingKg: number;
  /** Signed kg a week the date needs; null once the goal is reached or the date passed. */
  requiredKgPerWeek: number | null;
  /** The required pace as a share of current body weight, percent a week. */
  requiredPercentPerWeek: number | null;
  /** How hard the required pace is, by the same rule as the calorie settings. */
  safetyZone: WeeklyChangeSafetyZone | null;
  /** Signed kcal a day off (negative) or on top of maintenance the required pace means. */
  requiredDailyKcal: number | null;
  /** Calories a day for the required pace, when maintenance is known (rounded to 10). */
  suggestedCalories: number | null;
  /** The suggested calories would be under the floor. */
  belowFloor: boolean;
  /** The floor `belowFloor` was judged against (kcal a day), when one was given. */
  floorKcal: number | null;
  /** True when the engine holds the target at the floor, so a below-floor pace cannot be reached. */
  floorEnforced: boolean;
  /** When the date needs calories under the floor: the earliest day reachable at the floor. */
  earliestDate: string | null;
  /** When below the floor: the fastest signed pace the floor allows (kg a week, negative). */
  fastestKgPerWeek: number | null;
  settingKgPerWeek: number | null;
  /** Day the setting's pace reaches the goal, as a straight line; null when it does not head there. */
  settingReachDate: string | null;
  /** High cut's pace, when it is within reach of the required pace (loss only). */
  highCutKgPerWeek: number | null;
  /** Ahead or behind the straight path from the start; null without a start. */
  schedule: GoalWeightSchedule | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round10 = (value: number): number => Math.round(value / 10) * 10;

function reachDate(
  today: string,
  remainingKg: number,
  kgPerWeek: number
): string | null {
  if (
    Math.abs(kgPerWeek) < GOAL_WEIGHT_STEADY_KG_PER_WEEK ||
    Math.sign(kgPerWeek) !== Math.sign(remainingKg)
  ) {
    return null;
  }
  const days = Math.ceil((remainingKg / kgPerWeek) * 7);
  return days > 0 && days <= MAX_EARLIEST_DAYS ? addDays(today, days) : null;
}

function scheduleOf(input: GoalWeightPlanInput): GoalWeightSchedule | null {
  const { startKg, setOn, targetDate, goalKg, today, currentKg } = input;
  if (startKg == null || !setOn || !Number.isFinite(startKg)) return null;
  const total = daysBetween(setOn, targetDate);
  if (total <= 0 || startKg === goalKg) return null;
  const elapsed = Math.min(Math.max(daysBetween(setOn, today), 0), total);
  const perDay = (goalKg - startKg) / total;
  const plannedKg = startKg + perDay * elapsed;
  return {
    plannedKg: round2(plannedKg),
    // `|| 0` turns -0 into 0.
    daysAhead: Math.round((currentKg - plannedKg) / perDay) || 0,
  };
}

/** Works out where a dated goal weight stands against the current calorie setting. */
export function buildGoalWeightPlan(
  input: GoalWeightPlanInput
): GoalWeightPlan {
  const { today, targetDate, goalKg, currentKg, maintenanceKcal, floorKcal } =
    input;
  const floorEnforced = input.floorEnforced ?? true;
  const settingKgPerWeek =
    input.settingKgPerWeek === null ? null : round2(input.settingKgPerWeek);
  const remainingKg = round2(goalKg - currentKg);
  const daysLeft = daysBetween(today, targetDate);
  const startKg = input.startKg ?? null;
  const crossed =
    startKg !== null &&
    Math.sign(goalKg - startKg) !== 0 &&
    Math.sign(goalKg - currentKg) !== Math.sign(goalKg - startKg);
  const base = {
    daysLeft,
    remainingKg,
    settingKgPerWeek,
    settingReachDate:
      settingKgPerWeek === null
        ? null
        : reachDate(today, remainingKg, settingKgPerWeek),
    schedule: null,
    requiredKgPerWeek: null,
    requiredPercentPerWeek: null,
    safetyZone: null,
    requiredDailyKcal: null,
    suggestedCalories: null,
    belowFloor: false,
    floorKcal,
    floorEnforced,
    earliestDate: null,
    fastestKgPerWeek: null,
    highCutKgPerWeek: null,
  } satisfies Omit<GoalWeightPlan, 'status'>;

  if (Math.abs(remainingKg) <= GOAL_WEIGHT_REACHED_TOLERANCE_KG || crossed) {
    return { ...base, settingReachDate: null, status: 'reached' };
  }
  if (compareDays(targetDate, today) <= 0) {
    return { ...base, status: 'date_passed' };
  }

  const requiredKgPerWeek = round2((remainingKg / daysLeft) * 7);
  const isGain = requiredKgPerWeek > 0;
  const requiredPercentPerWeek =
    currentKg > 0
      ? round2((Math.abs(requiredKgPerWeek) / currentKg) * 100)
      : null;
  const requiredDailyKcal = Math.round(
    (requiredKgPerWeek * ENERGY_DENSITY_KCAL_PER_KG) / 7
  );
  const suggestedCalories =
    maintenanceKcal === null
      ? null
      : round10(maintenanceKcal + requiredDailyKcal);
  const belowFloor =
    !isGain &&
    suggestedCalories !== null &&
    floorKcal !== null &&
    suggestedCalories < floorKcal;

  let earliestDate: string | null = null;
  let fastestKgPerWeek: number | null = null;
  if (belowFloor && maintenanceKcal !== null && floorKcal !== null) {
    const fastest =
      ((floorKcal - maintenanceKcal) * 7) / ENERGY_DENSITY_KCAL_PER_KG;
    if (fastest < 0) {
      fastestKgPerWeek = round2(fastest);
      earliestDate = reachDate(today, remainingKg, fastest);
    }
  }

  let highCutKgPerWeek: number | null = null;
  if (!isGain && maintenanceKcal !== null && maintenanceKcal > 0) {
    const pace = round2(
      (-maintenanceKcal * getGoalModeAdjustment('high_cut') * 7) /
        ENERGY_DENSITY_KCAL_PER_KG
    );
    if (
      Math.abs(pace - requiredKgPerWeek) <=
      Math.abs(requiredKgPerWeek) * GOAL_WEIGHT_HIGH_CUT_MATCH
    ) {
      highCutKgPerWeek = pace;
    }
  }

  let status: GoalWeightPlanStatus;
  if (settingKgPerWeek === null) {
    status = 'no_setting';
  } else if (
    Math.abs(settingKgPerWeek) < GOAL_WEIGHT_STEADY_KG_PER_WEEK ||
    Math.sign(settingKgPerWeek) !== Math.sign(requiredKgPerWeek)
  ) {
    status = 'wrong_direction';
  } else {
    const ratio = settingKgPerWeek / requiredKgPerWeek;
    status =
      ratio < 1 - GOAL_WEIGHT_PACE_SHORT_TOLERANCE
        ? 'needs_faster'
        : ratio > 1 + GOAL_WEIGHT_PACE_OVER_TOLERANCE
          ? 'needs_slower'
          : 'on_course';
  }

  return {
    ...base,
    status,
    schedule: scheduleOf(input),
    requiredKgPerWeek,
    requiredPercentPerWeek,
    safetyZone:
      requiredPercentPerWeek === null
        ? null
        : weeklyChangeSafetyZone(requiredPercentPerWeek, isGain),
    requiredDailyKcal,
    suggestedCalories,
    belowFloor,
    floorKcal,
    floorEnforced,
    earliestDate,
    fastestKgPerWeek,
    highCutKgPerWeek,
  };
}
