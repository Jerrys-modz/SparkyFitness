import type {
  DeloadReason,
  DeloadSuggestion,
} from '../schemas/api/StrengthVolume.api.zod.ts';
import {
  isBodyweightModality,
  isExerciseModality,
} from '../constants/exercise.ts';
import { isWarmupSetType } from './dropSetCalculator.ts';
import {
  bodyWeightOnDay,
  effectiveLoadKg,
  effortAdjustedOneRepMaxKg,
} from './exerciseLoad.ts';
import type { MuscleEntry } from './exerciseMuscleAggregates.ts';
import {
  WEEKLY_HARD_SETS_MAX,
  entriesInWeek,
  hardSetsByMuscle,
  isHardSet,
} from './muscleVolume.ts';
import { addDays } from './timezone.ts';
import { weekStartOf } from './trainingConsistency.ts';

/*
 * A deload is a planned lighter week. The evidence for any one trigger is
 * thin (coach surveys such as Bell et al. 2022, plus general fatigue
 * management theory, rather than trials), so this is deliberately cautious:
 * it needs two points' worth of independent signals before it speaks, it
 * stays quiet right after a light week, and it only ever suggests.
 */

/** Weeks of history looked at for lift trends, this week included. */
export const DELOAD_TREND_WEEKS = 4;
/** Weeks of entries the function reads: the trend window plus a baseline. */
export const DELOAD_HISTORY_WEEKS = 6;

/** Signal weights; a suggestion needs `DELOAD_SCORE_THRESHOLD` in total. */
export const DELOAD_SCORE_THRESHOLD = 2;
const SCORE_E1RM_DROPPING = 2;
const SCORE_OTHER = 1;

/** A main lift is one trained in at least this many of the trend weeks. */
export const MAIN_LIFT_MIN_WEEKS = 3;
export const MAIN_LIFT_COUNT = 4;
/** Epley is only trusted up to about this many reps. */
const E1RM_MAX_REPS = 12;
/** A new weekly best must beat the earlier best by this much to be progress. */
export const E1RM_PROGRESS_TOLERANCE = 0.01;
/** Estimated 1RM this far below its peak counts as dropping, not stalled. */
export const E1RM_DROP_FRACTION = 0.05;

/** Sets within this share of each other's load are "the same load". */
export const SAME_LOAD_TOLERANCE = 0.025;
/** The same load feeling this many RPE points harder counts as rising. */
export const RPE_RISE_THRESHOLD = 1;
const MIN_SETS_FOR_RPE_COMPARE = 2;

/** Over-range muscles needed in each of the last two full weeks. */
export const HIGH_VOLUME_MIN_MUSCLES = 2;

/**
 * Recovery signals compare the last 7 days with the 28 days before them.
 * Readiness (a 0-100 device score) is low at 15% under its baseline. Overnight
 * HRV is noisy day to day, so it is low when the 7-day mean falls more than
 * half a baseline standard deviation below the baseline mean, the "smallest
 * worthwhile change" used in HRV-guided training research (Plews et al. 2013).
 */
export const RECOVERY_RECENT_DAYS = 7;
export const RECOVERY_BASELINE_DAYS = 28;
export const READINESS_DROP_FRACTION = 0.15;
export const HRV_DROP_SD = 0.5;
const MIN_RECENT_READINGS = 4;
const MIN_BASELINE_READINGS = 10;

/**
 * The proposed lighter week: a bit over half the sets at (nearly) the same
 * weights. Cutting sets rather than load keeps the technique and strength
 * practised while the fatigue clears; the load is allowed to dip a little for
 * a body that is run down. Practice-based, as above.
 */
export const DELOAD_SETS_PERCENT = { min: 50, max: 60 } as const;
export const DELOAD_LOAD_PERCENT = { min: 90, max: 100 } as const;

/** The last full week this far under the three before it was already a deload. */
export const RECENT_DELOAD_FRACTION = 0.65;

export interface DeloadSet {
  set_type?: string | null;
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  rpe?: number | null;
  rir?: number | null;
}

export interface DeloadEntry extends MuscleEntry {
  entry_date?: string;
  exercise_id?: string | null;
  exercise_name?: string;
  /** Exercise modality; entries without a known one are not used for 1RM. */
  exercise_modality?: string | null;
  sets?: DeloadSet[] | null;
}

export interface RecoveryReading {
  day: string;
  /** Device training readiness score, 0-100. */
  readinessScore?: number | null;
  /** Overnight HRV, ms. */
  overnightHrv?: number | null;
}

export interface DeloadInput {
  /** Exercise entries for at least the last `DELOAD_HISTORY_WEEKS` weeks. */
  entries: readonly DeloadEntry[];
  today: string;
  firstDayOfWeek: number;
  bodyWeights?: readonly { date: string; weightKg: number | null }[];
  /** Recent readiness/HRV readings; omit or leave empty when there are none. */
  recovery?: readonly RecoveryReading[];
}

interface LiftSet {
  day: string;
  loadKg: number;
  oneRepMaxKg: number;
  rpe: number | null;
}

interface Lift {
  key: string;
  name: string;
  /** weekStart -> working sets */
  byWeek: Map<string, LiftSet[]>;
}

function effortOf(set: DeloadSet): number | null {
  if (set.rir != null && Number.isFinite(Number(set.rir))) {
    return 10 - Number(set.rir);
  }
  if (set.rpe != null && Number.isFinite(Number(set.rpe))) {
    return Number(set.rpe);
  }
  return null;
}

function collectLifts(
  input: DeloadInput,
  trendWeeks: readonly string[]
): Lift[] {
  const lifts = new Map<string, Lift>();
  const firstWeek = trendWeeks[0]!;
  for (const entry of input.entries) {
    const day = entry.entry_date?.slice(0, 10);
    if (!day || day > input.today || day < firstWeek) continue;
    const modality = entry.exercise_modality;
    if (!isExerciseModality(modality)) continue;
    if (modality !== 'weight_reps' && !isBodyweightModality(modality)) continue;
    const name = entry.exercise_name;
    const key = entry.exercise_id ?? name;
    if (!key || !name) continue;
    const bodyWeightKg = isBodyweightModality(modality)
      ? bodyWeightOnDay(input.bodyWeights ?? [], day)
      : null;
    const weekStart = weekStartOf(day, input.firstDayOfWeek);
    const lift = lifts.get(key) ?? {
      key,
      name,
      byWeek: new Map<string, LiftSet[]>(),
    };
    lifts.set(key, lift);
    for (const set of entry.sets ?? []) {
      if (isWarmupSetType(set.set_type)) continue;
      const reps = Number(set.reps) || 0;
      const loadKg = effectiveLoadKg(set.weight, modality, bodyWeightKg);
      if (reps <= 0 || reps > E1RM_MAX_REPS || loadKg <= 0) continue;
      const rpe = effortOf(set);
      const bucket = lift.byWeek.get(weekStart) ?? [];
      bucket.push({
        day,
        loadKg,
        oneRepMaxKg: effortAdjustedOneRepMaxKg(loadKg, reps, rpe),
        rpe,
      });
      lift.byWeek.set(weekStart, bucket);
    }
  }
  return [...lifts.values()];
}

function mainLiftsOf(lifts: readonly Lift[]): Lift[] {
  return lifts
    .filter((lift) => lift.byWeek.size >= MAIN_LIFT_MIN_WEEKS)
    .sort((a, b) => {
      const count = (lift: Lift) =>
        [...lift.byWeek.values()].reduce((sum, sets) => sum + sets.length, 0);
      return count(b) - count(a) || a.name.localeCompare(b.name);
    })
    .slice(0, MAIN_LIFT_COUNT);
}

/** Weekly best estimated 1RM for the weeks the lift was trained, oldest first. */
function weeklyBests(lift: Lift, trendWeeks: readonly string[]): number[] {
  return trendWeeks.flatMap((week) => {
    const sets = lift.byWeek.get(week);
    if (!sets || sets.length === 0) return [];
    return [Math.max(...sets.map((set) => set.oneRepMaxKg))];
  });
}

type LiftTrend =
  | { kind: 'dropping'; dropFraction: number }
  | { kind: 'stalled' }
  | { kind: 'ok' };

function liftTrend(bests: readonly number[]): LiftTrend {
  if (bests.length < MAIN_LIFT_MIN_WEEKS) return { kind: 'ok' };
  const latest = bests[bests.length - 1]!;
  const peak = Math.max(...bests.slice(0, -1));
  if (peak > 0 && latest <= peak * (1 - E1RM_DROP_FRACTION)) {
    return { kind: 'dropping', dropFraction: 1 - latest / peak };
  }
  // Stalled: neither of the last two trained weeks beat the best before it.
  let best = Math.max(...bests.slice(0, -2));
  for (const value of bests.slice(-2)) {
    if (value > best * (1 + E1RM_PROGRESS_TOLERANCE)) return { kind: 'ok' };
    best = Math.max(best, value);
  }
  return { kind: 'stalled' };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Mean RPE at the same load between the earliest and latest weeks that have
 * RPE logged, or null when there is nothing comparable (the load moved, or
 * too few sets carry an RPE). Positive means the same weight now feels harder.
 */
function rpeRiseAtSameLoad(
  lift: Lift,
  trendWeeks: readonly string[]
): number | null {
  const weeks = trendWeeks.filter((week) =>
    (lift.byWeek.get(week) ?? []).some((set) => set.rpe != null)
  );
  if (weeks.length < 2) return null;
  const withRpe = (week: string) =>
    (lift.byWeek.get(week) ?? []).filter((set) => set.rpe != null);
  const early = withRpe(weeks[0]!);
  const late = withRpe(weeks[weeks.length - 1]!);
  const close = (a: LiftSet, b: LiftSet) =>
    Math.abs(a.loadKg - b.loadKg) <= a.loadKg * SAME_LOAD_TOLERANCE;
  const lateMatched = late.filter((l) => early.some((e) => close(l, e)));
  const earlyMatched = early.filter((e) => late.some((l) => close(l, e)));
  if (
    lateMatched.length < MIN_SETS_FOR_RPE_COMPARE ||
    earlyMatched.length < MIN_SETS_FOR_RPE_COMPARE
  ) {
    return null;
  }
  return (
    mean(lateMatched.map((set) => set.rpe!)) -
    mean(earlyMatched.map((set) => set.rpe!))
  );
}

function recoveryReason(
  input: DeloadInput,
  pick: (reading: RecoveryReading) => number | null | undefined,
  isLow: (recent: number, baseline: readonly number[]) => number | null
): number | null {
  const recentStart = addDays(input.today, -(RECOVERY_RECENT_DAYS - 1));
  const baselineStart = addDays(recentStart, -RECOVERY_BASELINE_DAYS);
  const recent: number[] = [];
  const baseline: number[] = [];
  for (const reading of input.recovery ?? []) {
    const value = pick(reading);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    if (reading.day >= recentStart && reading.day <= input.today) {
      recent.push(value);
    } else if (reading.day >= baselineStart && reading.day < recentStart) {
      baseline.push(value);
    }
  }
  if (
    recent.length < MIN_RECENT_READINGS ||
    baseline.length < MIN_BASELINE_READINGS
  ) {
    return null;
  }
  return isLow(mean(recent), baseline);
}

function totalHardSets(entries: readonly MuscleEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (entry.sets ?? []).filter(isHardSet).length,
    0
  );
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Whether a lighter week would help, from recent training and recovery. Pure
 * and advisory: it returns the reasons and a proposed week, and never
 * changes a plan. Any change to a program or plan made from it goes through
 * the existing confirmed-change flow.
 */
export function suggestDeload(input: DeloadInput): DeloadSuggestion {
  const thisWeekStart = weekStartOf(input.today, input.firstDayOfWeek);
  const trendWeeks = Array.from({ length: DELOAD_TREND_WEEKS }, (_, i) =>
    addDays(thisWeekStart, -7 * (DELOAD_TREND_WEEKS - 1 - i))
  );
  const entries = input.entries.filter(
    (entry) => (entry.entry_date?.slice(0, 10) ?? '') <= input.today
  );
  const none = (
    status: 'notEnoughData' | 'recentlyDeloaded'
  ): DeloadSuggestion => ({ status, reasons: [], score: 0, plan: null });

  const trainedWeeks = trendWeeks.filter(
    (week) => totalHardSets(entriesInWeek(entries, week)) > 0
  );
  const lastWeekStart = addDays(thisWeekStart, -7);
  if (
    trainedWeeks.length < MAIN_LIFT_MIN_WEEKS ||
    (!trainedWeeks.includes(thisWeekStart) &&
      !trainedWeeks.includes(lastWeekStart))
  ) {
    return none('notEnoughData');
  }

  // A light last week means the deload has just happened.
  const earlierTotals = [2, 3, 4].map((back) =>
    totalHardSets(entriesInWeek(entries, addDays(thisWeekStart, -7 * back)))
  );
  const earlierTrained = earlierTotals.filter((total) => total > 0);
  const lastWeekTotal = totalHardSets(entriesInWeek(entries, lastWeekStart));
  if (
    earlierTrained.length >= 2 &&
    lastWeekTotal <= mean(earlierTrained) * RECENT_DELOAD_FRACTION
  ) {
    return none('recentlyDeloaded');
  }

  const reasons: (DeloadReason & { weight: number })[] = [];

  const mainLifts = mainLiftsOf(collectLifts(input, trendWeeks));
  const trends = mainLifts.map((lift) => ({
    lift,
    trend: liftTrend(weeklyBests(lift, trendWeeks)),
  }));
  const dropping = trends.flatMap(({ lift, trend }) =>
    trend.kind === 'dropping' ? [{ lift, drop: trend.dropFraction }] : []
  );
  const stalled = trends.filter(({ trend }) => trend.kind === 'stalled');
  if (dropping.length > 0) {
    reasons.push({
      code: 'e1rm_dropping',
      items: dropping.map(({ lift }) => lift.name),
      value: Math.round(Math.max(...dropping.map(({ drop }) => drop)) * 100),
      weight: SCORE_E1RM_DROPPING,
    });
  }
  if (stalled.length > 0 && stalled.length >= Math.ceil(mainLifts.length / 2)) {
    reasons.push({
      code: 'e1rm_stalled',
      items: stalled.map(({ lift }) => lift.name),
      value: null,
      weight: SCORE_OTHER,
    });
  }

  const rising = mainLifts.flatMap((lift) => {
    const rise = rpeRiseAtSameLoad(lift, trendWeeks);
    return rise != null && rise >= RPE_RISE_THRESHOLD ? [{ lift, rise }] : [];
  });
  if (rising.length > 0) {
    reasons.push({
      code: 'rpe_rising',
      items: rising.map(({ lift }) => lift.name),
      value: Math.round(Math.max(...rising.map(({ rise }) => rise)) * 10),
      // Several lifts all feeling harder is a broader sign than one.
      weight: rising.length >= 2 ? 2 * SCORE_OTHER : SCORE_OTHER,
    });
  }

  const overMuscles = (weekStart: string): string[] =>
    Object.entries(hardSetsByMuscle(entriesInWeek(entries, weekStart)))
      .filter(([, sets]) => sets > WEEKLY_HARD_SETS_MAX)
      .map(([muscle]) => muscle);
  const overLast = overMuscles(lastWeekStart);
  const overBefore = overMuscles(addDays(lastWeekStart, -7));
  if (
    overLast.length >= HIGH_VOLUME_MIN_MUSCLES &&
    overBefore.length >= HIGH_VOLUME_MIN_MUSCLES
  ) {
    reasons.push({
      code: 'high_volume',
      items: overLast,
      value: null,
      weight: SCORE_OTHER,
    });
  }

  const readinessDrop = recoveryReason(
    input,
    (reading) => reading.readinessScore,
    (recent, baseline) => {
      const base = mean(baseline);
      return recent <= base * (1 - READINESS_DROP_FRACTION)
        ? Math.round((1 - recent / base) * 100)
        : null;
    }
  );
  if (readinessDrop != null) {
    reasons.push({
      code: 'readiness_low',
      items: [],
      value: readinessDrop,
      weight: SCORE_OTHER,
    });
  }
  const hrvDrop = recoveryReason(
    input,
    (reading) => reading.overnightHrv,
    (recent, baseline) => {
      const base = mean(baseline);
      const sd = Math.sqrt(mean(baseline.map((v) => (v - base) ** 2)));
      return sd > 0 && recent < base - HRV_DROP_SD * sd
        ? Math.round((1 - recent / base) * 100)
        : null;
    }
  );
  if (hrvDrop != null) {
    reasons.push({
      code: 'hrv_low',
      items: [],
      value: hrvDrop,
      weight: SCORE_OTHER,
    });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  const publicReasons = reasons.map(({ weight: _weight, ...reason }) => reason);
  if (score < DELOAD_SCORE_THRESHOLD) {
    return { status: 'ok', reasons: publicReasons, score, plan: null };
  }

  // Baseline for the lighter week: the last full week, else this one so far.
  const baselineWeek = lastWeekTotal > 0 ? lastWeekStart : thisWeekStart;
  const baseline = hardSetsByMuscle(entriesInWeek(entries, baselineWeek));
  const muscleTargets = Object.entries(baseline)
    .filter(([, sets]) => sets >= 1)
    .map(([muscle, sets]) => {
      const from = roundHalf((sets * DELOAD_SETS_PERCENT.min) / 100);
      const to = roundHalf((sets * DELOAD_SETS_PERCENT.max) / 100);
      return { muscle, from, to: Math.max(from, to) };
    })
    .sort((a, b) => b.to - a.to || a.muscle.localeCompare(b.muscle));
  return {
    status: 'suggest',
    reasons: publicReasons,
    score,
    plan: {
      weekStart: addDays(thisWeekStart, 7),
      setsPercent: { ...DELOAD_SETS_PERCENT },
      loadPercent: { ...DELOAD_LOAD_PERCENT },
      muscleTargets,
    },
  };
}
