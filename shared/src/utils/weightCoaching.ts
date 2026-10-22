import { ENERGY_DENSITY_KCAL_PER_KG } from '../constants/calorieConstants.ts';
import {
  addDays,
  compareDays,
  dayOfWeek,
  daysBetween,
  isDayString,
} from './timezone.ts';

// Weekly weight coaching: turns the logged weight trend and logged intake into
// an estimate of real expenditure, compares progress with the goal rate and
// proposes new daily targets. Pure and unit-agnostic of storage: weights are kg,
// days are YYYY-MM-DD strings. Nothing here changes a goal; callers decide.
//
// The expenditure maths is the same energy balance AdaptiveTdeeService uses
// (average intake minus the energy implied by the weight change, priced with
// ENERGY_DENSITY_KCAL_PER_KG). What differs is the weight trend: this module
// fits a robust line instead of differencing two smoothed endpoints, so one
// missed or wildly wrong weigh-in, or a water swing, cannot move the estimate.

/** Days of data one estimate looks at. */
export const COACHING_WINDOW_DAYS = 28;
/** Usable logged-intake days required in the window before saying anything. */
export const COACHING_MIN_LOGGED_DAYS = 10;
/** Weigh-ins (after outlier rejection) required in the window. */
export const COACHING_MIN_WEIGH_INS = 5;
/** Days between the first and last weigh-in required in the window. */
export const COACHING_MIN_WEIGH_SPAN_DAYS = 14;
/** Share of the days since tracking began that must have usable intake. */
export const COACHING_MIN_ADHERENCE = 0.6;
/** A day under this share of the usual (median) intake counts as not fully logged. */
export const COACHING_INCOMPLETE_DAY_FRACTION = 0.4;
/** The calorie target moves by at most this share of itself per check-in. */
export const COACHING_MAX_WEEKLY_CHANGE_FRACTION = 0.1;
/** Smaller moves than this are not worth a check-in; the target stays as it is. */
export const COACHING_MIN_MEANINGFUL_CHANGE_KCAL = 25;
export const COACHING_CALORIE_ROUNDING_KCAL = 10;
/** Weight trend: share of the gap to a new weigh-in absorbed per day. */
export const COACHING_TREND_DAILY_ALPHA = 0.1;
/** Weigh-ins further than this many robust standard deviations from the line are dropped. */
export const COACHING_OUTLIER_SIGMAS = 3;
/** The robust spread never goes below this, so a very steady scale does not reject honest swings. */
export const COACHING_MIN_WEIGHT_SCALE_KG = 0.4;
/** Estimates outside this range come from bad data, not a body. */
export const COACHING_EXPENDITURE_MIN_KCAL = 1000;
export const COACHING_EXPENDITURE_MAX_KCAL = 6000;
/** Weekly estimates smoothed into the expenditure history. */
export const COACHING_HISTORY_POINTS = 8;
export const COACHING_HISTORY_STEP_DAYS = 7;
export const COACHING_HISTORY_SMOOTHING = 0.5;
/**
 * How much the weigh-in noise (the roughly 95% margin on the estimate) is
 * trusted. At or under the first the suggested change is used in full; at or
 * over the second nothing is suggested; in between it is scaled down.
 */
export const COACHING_MARGIN_FULL_TRUST_KCAL = 150;
export const COACHING_MARGIN_NO_TRUST_KCAL = 450;
export const COACHING_MAX_RATE_KG_PER_WEEK = 1;
export const COACHING_DEFAULT_RATE_KG_PER_WEEK = 0.25;
/** Protein is never cut below the lower of the current amount and this per kg of body weight. */
export const COACHING_PROTEIN_FLOOR_G_PER_KG = 1.6;
/** On track when the weekly rate is within this of the goal rate (or 25% of it, if larger). */
export const COACHING_RATE_TOLERANCE_KG = 0.1;
export const COACHING_RATE_TOLERANCE_FRACTION = 0.25;
const Z_95 = 1.96;
const DEFAULT_MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fat: 0.3 } as const;

export const COACHING_GOAL_DIRECTIONS = ['lose', 'maintain', 'gain'] as const;
export type CoachingGoalDirection = (typeof COACHING_GOAL_DIRECTIONS)[number];

/** Why the check-in says what it says. Clients map each key to plain-language copy. */
export type CoachingReason =
  | 'insufficient-data'
  | 'low-adherence'
  | 'implausible-estimate'
  | 'on-track'
  | 'behind'
  | 'ahead'
  /** A maintain goal whose weight is moving. */
  | 'drifting'
  /** The target is right for the estimated expenditure, so the weight is off because intake is not following it. */
  | 'off-target-intake';

/** What bound the suggested calories, beyond the estimate itself. */
export type CoachingLimit =
  'weekly-cap' | 'safety-floor' | 'uncertain-estimate';

export interface CoachingWeighIn {
  /** YYYY-MM-DD. */
  date: string;
  weightKg: number;
}

export interface CoachingIntakeDay {
  /** YYYY-MM-DD. */
  date: string;
  calories: number;
  /** The person marked the day as not fully logged. */
  incomplete?: boolean;
}

export interface CoachingTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WeightCoachingInput {
  /** The person's local today. */
  today: string;
  weighIns: readonly CoachingWeighIn[];
  intake: readonly CoachingIntakeDay[];
  /** The calories and macro grams in effect today. */
  current: CoachingTargets;
  goal: { direction: CoachingGoalDirection; rateKgPerWeek: number };
  /** Lowest calories the person allows (null when the floor is turned off). */
  safetyFloorKcal: number | null;
  /**
   * Calories the stored macro percentages do not apply to (fibre is taken off
   * first); 0 for a goal stored in grams.
   */
  macroBudgetOffsetKcal?: number;
}

export interface CoachingDataQuality {
  /** Days from the first usable data to today, capped at the window. */
  windowDays: number;
  /** Days with usable intake. */
  loggedDays: number;
  /** Days left out as flagged incomplete or far below the usual intake. */
  excludedDays: number;
  /** Weigh-ins used (outliers removed). */
  weighIns: number;
  /** Weigh-ins ignored as implausible against the trend. */
  outlierWeighIns: number;
  weighInSpanDays: number;
  /** loggedDays / windowDays, 0 to 1. */
  adherence: number;
  missingLoggedDays: number;
  missingWeighIns: number;
  missingSpanDays: number;
  ready: boolean;
}

export interface CoachingTrendPoint {
  date: string;
  weightKg: number;
  /** Smoothed weight on this day. */
  trendKg: number;
  /** Left out of the trend and the rate as implausible. */
  outlier: boolean;
}

export interface ExpenditureEstimate {
  date: string;
  kcal: number;
  avgIntakeKcal: number;
  /** Signed kg per week, fitted over the window. */
  weeklyRateKg: number;
  /** Roughly 95% half-width from weigh-in noise alone, in kcal. */
  marginKcal: number;
}

export interface ExpenditureHistoryPoint {
  date: string;
  kcal: number;
  smoothedKcal: number;
}

export interface WeightCoachingCheckIn {
  asOf: string;
  reason: CoachingReason;
  dataQuality: CoachingDataQuality;
  trend: {
    series: CoachingTrendPoint[];
    currentKg: number | null;
    weeklyRateKg: number | null;
  };
  expenditure: {
    /** Smoothed estimate the suggestion is built from. */
    kcal: number | null;
    /** Latest unsmoothed estimate. */
    rawKcal: number | null;
    avgIntakeKcal: number | null;
    marginKcal: number | null;
    history: ExpenditureHistoryPoint[];
  };
  goal: {
    direction: CoachingGoalDirection;
    rateKgPerWeek: number;
    /** Signed kg per week the goal asks for. */
    targetWeeklyChangeKg: number;
  };
  current: CoachingTargets;
  /** New targets; null when nothing should change. */
  suggested: CoachingTargets | null;
  changeKcal: number;
  limits: CoachingLimit[];
  proteinFloorApplied: boolean;
  actionable: boolean;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface XY {
  x: number;
  y: number;
}

function theilSenLine(points: readonly XY[]): {
  slope: number;
  intercept: number;
} {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j]!.x - points[i]!.x;
      if (dx !== 0) slopes.push((points[j]!.y - points[i]!.y) / dx);
    }
  }
  const slope = median(slopes);
  const intercept = median(points.map((p) => p.y - slope * p.x));
  return { slope, intercept };
}

function leastSquares(points: readonly XY[]): {
  slope: number;
  intercept: number;
  seSlope: number;
} | null {
  const n = points.length;
  if (n < 3) return null;
  const meanX = mean(points.map((p) => p.x));
  const meanY = mean(points.map((p) => p.y));
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (const p of points) sse += (p.y - (intercept + slope * p.x)) ** 2;
  return { slope, intercept, seSlope: Math.sqrt(sse / (n - 2) / sxx) };
}

interface WeightFit {
  /** kg per day over the inliers. */
  slope: number;
  seSlope: number;
  /** Same order as the points passed in. */
  inlier: boolean[];
}

/**
 * Line through the weigh-ins, robust to wild readings: a Theil-Sen line finds
 * the outliers (more than three robust deviations away), then least squares on
 * the rest gives the rate and its uncertainty.
 */
function fitWeights(points: readonly XY[]): WeightFit | null {
  if (points.length < 3) return null;
  const rough = theilSenLine(points);
  const residuals = points.map(
    (p) => p.y - (rough.intercept + rough.slope * p.x)
  );
  const centre = median(residuals);
  const mad = median(residuals.map((r) => Math.abs(r - centre)));
  const scale = Math.max(1.4826 * mad, COACHING_MIN_WEIGHT_SCALE_KG);
  const inlier = residuals.map(
    (r) => Math.abs(r - centre) <= COACHING_OUTLIER_SIGMAS * scale
  );
  const kept = points.filter((_, i) => inlier[i]);
  const fit = leastSquares(kept);
  if (!fit) return null;
  return { slope: fit.slope, seSlope: fit.seSlope, inlier };
}

function dedupeWeighIns(
  weighIns: readonly CoachingWeighIn[],
  from: string,
  to: string
): CoachingWeighIn[] {
  const byDay = new Map<string, number>();
  for (const w of weighIns) {
    if (
      isDayString(w.date) &&
      Number.isFinite(w.weightKg) &&
      w.weightKg > 0 &&
      compareDays(w.date, from) >= 0 &&
      compareDays(w.date, to) <= 0
    ) {
      byDay.set(w.date, w.weightKg);
    }
  }
  return [...byDay.entries()]
    .map(([date, weightKg]) => ({ date, weightKg }))
    .sort((a, b) => compareDays(a.date, b.date));
}

interface WindowAnalysis {
  quality: CoachingDataQuality;
  series: CoachingTrendPoint[];
  estimate: ExpenditureEstimate | null;
}

function analyzeWindow(
  weighInsIn: readonly CoachingWeighIn[],
  intakeIn: readonly CoachingIntakeDay[],
  endDay: string,
  /** A day still being logged: its intake is left out, since it is not a whole day yet. */
  partialDay?: string
): WindowAnalysis {
  const start = addDays(endDay, -(COACHING_WINDOW_DAYS - 1));
  const lastIntakeDay = partialDay === endDay ? addDays(endDay, -1) : endDay;
  const weighIns = dedupeWeighIns(weighInsIn, start, endDay);

  const intakeByDay = new Map<string, CoachingIntakeDay>();
  for (const d of intakeIn) {
    if (
      isDayString(d.date) &&
      compareDays(d.date, start) >= 0 &&
      compareDays(d.date, lastIntakeDay) <= 0
    ) {
      intakeByDay.set(d.date, d);
    }
  }
  const flagged = [...intakeByDay.values()].filter(
    (d) =>
      d.incomplete === true && Number.isFinite(d.calories) && d.calories > 0
  ).length;
  const logged = [...intakeByDay.values()].filter(
    (d) =>
      d.incomplete !== true && Number.isFinite(d.calories) && d.calories > 0
  );
  const usual = median(logged.map((d) => d.calories));
  const kept = logged.filter(
    (d) => d.calories >= COACHING_INCOMPLETE_DAY_FRACTION * usual
  );
  const excludedDays = flagged + (logged.length - kept.length);

  const points = weighIns.map((w) => ({
    x: daysBetween(start, w.date),
    y: w.weightKg,
  }));
  const fit = fitWeights(points);
  const inlierFlags = fit ? fit.inlier : points.map(() => true);
  const usedWeighIns = weighIns.filter((_, i) => inlierFlags[i]);

  // Trend line: time-aware exponential smoothing over the weigh-ins we trust.
  const series: CoachingTrendPoint[] = [];
  let trend: number | null = null;
  let lastDay: string | null = null;
  weighIns.forEach((w, i) => {
    const outlier = !inlierFlags[i];
    if (!outlier) {
      if (trend === null || lastDay === null) {
        trend = w.weightKg;
      } else {
        const gap = Math.max(1, daysBetween(lastDay, w.date));
        const alpha = 1 - (1 - COACHING_TREND_DAILY_ALPHA) ** gap;
        trend = trend + alpha * (w.weightKg - trend);
      }
      lastDay = w.date;
    }
    series.push({
      date: w.date,
      weightKg: w.weightKg,
      trendKg: trend ?? w.weightKg,
      outlier,
    });
  });

  const firstDays = [
    weighIns[0]?.date,
    kept.length > 0 ? kept.map((d) => d.date).sort(compareDays)[0] : undefined,
  ].filter((d): d is string => d !== undefined);
  const first = firstDays.sort(compareDays)[0];
  const windowDays = first
    ? Math.max(
        0,
        Math.min(COACHING_WINDOW_DAYS, daysBetween(first, lastIntakeDay) + 1)
      )
    : 0;
  const spanDays =
    usedWeighIns.length > 1
      ? daysBetween(
          usedWeighIns[0]!.date,
          usedWeighIns[usedWeighIns.length - 1]!.date
        )
      : 0;
  const adherence = windowDays > 0 ? Math.min(1, kept.length / windowDays) : 0;
  const missingLoggedDays = Math.max(0, COACHING_MIN_LOGGED_DAYS - kept.length);
  const missingWeighIns = Math.max(
    0,
    COACHING_MIN_WEIGH_INS - usedWeighIns.length
  );
  const missingSpanDays = Math.max(0, COACHING_MIN_WEIGH_SPAN_DAYS - spanDays);
  const quality: CoachingDataQuality = {
    windowDays,
    loggedDays: kept.length,
    excludedDays,
    weighIns: usedWeighIns.length,
    outlierWeighIns: weighIns.length - usedWeighIns.length,
    weighInSpanDays: spanDays,
    adherence,
    missingLoggedDays,
    missingWeighIns,
    missingSpanDays,
    ready:
      missingLoggedDays + missingWeighIns + missingSpanDays === 0 &&
      fit !== null,
  };

  if (!quality.ready || !fit) return { quality, series, estimate: null };

  const avgIntake = mean(kept.map((d) => d.calories));
  const kcal = avgIntake - fit.slope * ENERGY_DENSITY_KCAL_PER_KG;
  return {
    quality,
    series,
    estimate: {
      date: endDay,
      kcal,
      avgIntakeKcal: avgIntake,
      weeklyRateKg: fit.slope * 7,
      marginKcal: Z_95 * fit.seSlope * ENERGY_DENSITY_KCAL_PER_KG,
    },
  };
}

/**
 * Estimate for each of the last weeks, oldest first, with an exponentially
 * smoothed copy so one odd week does not swing the number a target is built on.
 */
export function buildExpenditureHistory(
  weighIns: readonly CoachingWeighIn[],
  intake: readonly CoachingIntakeDay[],
  today: string
): ExpenditureHistoryPoint[] {
  const raw: ExpenditureEstimate[] = [];
  for (let k = COACHING_HISTORY_POINTS - 1; k >= 0; k--) {
    const { estimate } = analyzeWindow(
      weighIns,
      intake,
      addDays(today, -k * COACHING_HISTORY_STEP_DAYS),
      today
    );
    if (estimate) raw.push(estimate);
  }
  let smoothed: number | null = null;
  return raw.map((e) => {
    smoothed =
      smoothed === null
        ? e.kcal
        : COACHING_HISTORY_SMOOTHING * e.kcal +
          (1 - COACHING_HISTORY_SMOOTHING) * smoothed;
    return { date: e.date, kcal: e.kcal, smoothedKcal: smoothed };
  });
}

function signOf(direction: CoachingGoalDirection): -1 | 0 | 1 {
  return direction === 'lose' ? -1 : direction === 'gain' ? 1 : 0;
}

/** Signed kg per week a goal asks for. */
export function targetWeeklyChangeKg(
  direction: CoachingGoalDirection,
  rateKgPerWeek: number
): number {
  const rate = Number.isFinite(rateKgPerWeek)
    ? Math.min(Math.max(rateKgPerWeek, 0), COACHING_MAX_RATE_KG_PER_WEEK)
    : 0;
  return signOf(direction) * rate;
}

/**
 * New macro grams for `calories`, keeping the current split. Protein is held at
 * or above the lower of its current amount and the per-kg floor; carbs and fat
 * share what is left in their current ratio. `budgetOffsetKcal` is the part of
 * the calories the macros do not cover (fibre, for goals stored as percentages).
 */
export function splitMacrosForCalories(
  current: CoachingTargets,
  calories: number,
  weightKg: number | null,
  budgetOffsetKcal = 0
): { targets: CoachingTargets; proteinFloorApplied: boolean } {
  const pKcal = 4 * current.protein;
  const cKcal = 4 * current.carbs;
  const fKcal = 9 * current.fat;
  const total = pKcal + cKcal + fKcal;
  const share =
    total > 0
      ? { protein: pKcal / total, carbs: cKcal / total, fat: fKcal / total }
      : DEFAULT_MACRO_SPLIT;
  const budget = Math.max(0, calories - budgetOffsetKcal);

  const splitProtein = (budget * share.protein) / 4;
  const floorG =
    weightKg !== null && weightKg > 0
      ? Math.min(current.protein, COACHING_PROTEIN_FLOOR_G_PER_KG * weightKg)
      : 0;
  const protein = Math.min(Math.max(splitProtein, floorG), budget / 4);
  const proteinFloorApplied = Math.round(protein) > Math.round(splitProtein);

  const remaining = Math.max(0, budget - 4 * protein);
  const nonProteinShare = share.carbs + share.fat;
  const carbShare = nonProteinShare > 0 ? share.carbs / nonProteinShare : 1;
  const carbs = (remaining * carbShare) / 4;
  const fat = (remaining * (1 - carbShare)) / 9;
  return {
    targets: {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    },
    proteinFloorApplied,
  };
}

export type CoachingDataNote =
  | { kind: 'logDays'; count: number }
  | { kind: 'weighIns'; count: number }
  | { kind: 'weighSpan'; count: number }
  | { kind: 'lowAdherence'; percent: number }
  | { kind: 'excludedDays'; count: number }
  | { kind: 'outliers'; count: number };

/**
 * What would make the estimate more reliable, most important first. Empty when
 * there is nothing to add. Clients turn each note into a sentence.
 */
export function coachingDataNotes(
  quality: CoachingDataQuality,
  reason: CoachingReason
): CoachingDataNote[] {
  const notes: CoachingDataNote[] = [];
  if (quality.missingLoggedDays > 0) {
    notes.push({ kind: 'logDays', count: quality.missingLoggedDays });
  }
  if (quality.missingWeighIns > 0) {
    notes.push({ kind: 'weighIns', count: quality.missingWeighIns });
  }
  if (quality.missingSpanDays > 0) {
    notes.push({ kind: 'weighSpan', count: quality.missingSpanDays });
  }
  if (reason === 'low-adherence') {
    notes.push({
      kind: 'lowAdherence',
      percent: Math.round(quality.adherence * 100),
    });
  }
  if (quality.excludedDays > 0) {
    notes.push({ kind: 'excludedDays', count: quality.excludedDays });
  }
  if (quality.outlierWeighIns > 0) {
    notes.push({ kind: 'outliers', count: quality.outlierWeighIns });
  }
  return notes;
}

/** Whether `today` falls on the person's chosen check-in weekday (0 = Sunday). */
export function isCoachingCheckInDay(today: string, weekday: number): boolean {
  return isDayString(today) && dayOfWeek(today) === weekday;
}

/**
 * The weekly check-in: robust weight trend, estimated expenditure, progress
 * against the goal rate and, only when it is warranted, new targets.
 */
export function buildWeightCoachingCheckIn(
  input: WeightCoachingInput
): WeightCoachingCheckIn {
  const { today, current, goal } = input;
  const target = targetWeeklyChangeKg(goal.direction, goal.rateKgPerWeek);
  const analysis = analyzeWindow(input.weighIns, input.intake, today, today);
  const history = buildExpenditureHistory(input.weighIns, input.intake, today);
  const latest = history[history.length - 1];
  const hasCurrentEstimate =
    analysis.estimate !== null && latest?.date === today;
  const smoothed = hasCurrentEstimate && latest ? latest.smoothedKcal : null;
  const lastPoint = analysis.series[analysis.series.length - 1];
  const trendKg = lastPoint ? lastPoint.trendKg : null;

  const base: WeightCoachingCheckIn = {
    asOf: today,
    reason: 'insufficient-data',
    dataQuality: analysis.quality,
    trend: {
      series: analysis.series,
      currentKg: trendKg,
      weeklyRateKg: analysis.estimate ? analysis.estimate.weeklyRateKg : null,
    },
    expenditure: {
      kcal: smoothed,
      rawKcal: analysis.estimate ? analysis.estimate.kcal : null,
      avgIntakeKcal: analysis.estimate ? analysis.estimate.avgIntakeKcal : null,
      marginKcal: analysis.estimate ? analysis.estimate.marginKcal : null,
      history,
    },
    goal: {
      direction: goal.direction,
      rateKgPerWeek: Math.abs(target),
      targetWeeklyChangeKg: target,
    },
    current,
    suggested: null,
    changeKcal: 0,
    limits: [],
    proteinFloorApplied: false,
    actionable: false,
  };

  if (!analysis.quality.ready || smoothed === null || !analysis.estimate) {
    return base;
  }
  if (analysis.quality.adherence < COACHING_MIN_ADHERENCE) {
    return { ...base, reason: 'low-adherence' };
  }
  if (
    smoothed < COACHING_EXPENDITURE_MIN_KCAL ||
    smoothed > COACHING_EXPENDITURE_MAX_KCAL
  ) {
    return { ...base, reason: 'implausible-estimate' };
  }

  const rate = analysis.estimate.weeklyRateKg;
  const sign = signOf(goal.direction);
  const tolerance = Math.max(
    COACHING_RATE_TOLERANCE_KG,
    COACHING_RATE_TOLERANCE_FRACTION * Math.abs(target)
  );
  const onTrack =
    sign === 0
      ? Math.abs(rate) <= tolerance
      : Math.abs(rate - target) <= tolerance;
  if (onTrack) return { ...base, reason: 'on-track' };
  const reason: CoachingReason =
    sign === 0 ? 'drifting' : (rate - target) * sign > 0 ? 'ahead' : 'behind';

  // Calories that would produce the goal rate at this expenditure.
  const wanted = smoothed + (target * ENERGY_DENSITY_KCAL_PER_KG) / 7;
  const limits: CoachingLimit[] = [];
  let calories = wanted;
  if (current.calories > 0) {
    const maxStep = COACHING_MAX_WEEKLY_CHANGE_FRACTION * current.calories;
    const step = calories - current.calories;
    if (Math.abs(step) > maxStep) {
      calories = current.calories + Math.sign(step) * maxStep;
      limits.push('weekly-cap');
    }
  }
  // Weigh-in noise: the less certain the estimate, the less of the change is
  // taken, down to none.
  const targetStillRight =
    Math.abs(wanted - current.calories) < COACHING_MIN_MEANINGFUL_CHANGE_KCAL;
  const margin = analysis.estimate.marginKcal;
  const confidence = Math.min(
    1,
    Math.max(
      0,
      (COACHING_MARGIN_NO_TRUST_KCAL - margin) /
        (COACHING_MARGIN_NO_TRUST_KCAL - COACHING_MARGIN_FULL_TRUST_KCAL)
    )
  );
  if (current.calories > 0 && confidence < 1) {
    calories = current.calories + (calories - current.calories) * confidence;
    limits.push('uncertain-estimate');
  }
  calories =
    Math.round(calories / COACHING_CALORIE_ROUNDING_KCAL) *
    COACHING_CALORIE_ROUNDING_KCAL;
  if (input.safetyFloorKcal !== null && calories < input.safetyFloorKcal) {
    calories = Math.ceil(input.safetyFloorKcal);
    limits.push('safety-floor');
  }

  const changeKcal = calories - current.calories;
  if (Math.abs(changeKcal) < COACHING_MIN_MEANINGFUL_CHANGE_KCAL) {
    // The target already fits the estimated expenditure, yet the weight is not
    // moving at the goal rate: what is eaten is not what the target says.
    return {
      ...base,
      reason: targetStillRight ? 'off-target-intake' : reason,
      limits: targetStillRight ? [] : limits,
    };
  }
  const { targets, proteinFloorApplied } = splitMacrosForCalories(
    current,
    calories,
    trendKg,
    input.macroBudgetOffsetKcal ?? 0
  );
  return {
    ...base,
    reason,
    suggested: targets,
    changeKcal,
    limits,
    proteinFloorApplied,
    actionable: true,
  };
}
