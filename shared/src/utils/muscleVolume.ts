import type {
  MuscleVolumeRow,
  VolumeStatus,
} from '../schemas/api/StrengthVolume.api.zod.ts';
import { isWarmupSetType } from './dropSetCalculator.ts';
import {
  primaryMusclesOf,
  secondaryMusclesOf,
  type MuscleEntry,
  type MuscleSet,
} from './exerciseMuscleAggregates.ts';
import { weekStartOf } from './trainingConsistency.ts';
import { addDays } from './timezone.ts';

/**
 * How much one hard set counts toward a muscle. A primary mover gets the full
 * set. A secondary muscle (triceps in a bench press) gets half: it is worked,
 * but the lift stops when the prime mover does. Half is the common
 * "fractional set" convention in the volume literature; research that counts
 * only direct sets and research that counts every involved muscle both fit
 * inside the range below, so the exact fraction is not critical.
 */
export const PRIMARY_MUSCLE_SET_WEIGHT = 1;
export const SECONDARY_MUSCLE_SET_WEIGHT = 0.5;

/**
 * A set is "hard" when it ends within four reps of failure: RPE 6 or higher,
 * or 4 or fewer reps in reserve. Sets stopped further from failure add little
 * stimulus per set (Refalo et al. 2023 found no evidence that sets taken to
 * failure beat sets stopped short of it; the four-rep line is a convention,
 * and sets stopped far from failure are generally treated as warm-up-like
 * work), so a set logged easier than this does not count. A set with no RPE or RIR
 * is assumed to be a normal working set and counts.
 */
export const HARD_SET_MIN_RPE = 6;
export const HARD_SET_MAX_RIR = 4;

/**
 * Weekly hard sets per muscle that are worth aiming for. Below the minimum is
 * flagged as under-trained, above the maximum as over-trained.
 *
 * Minimum 10: Schoenfeld, Ogborn and Krieger (2017) pooled studies and saw
 * muscle growth rise with weekly sets, clearest at 10 or more (the formal
 * comparison between volume bands was only a trend, so 10 is a guide). Maximum 20: the same line of research, and the later
 * meta-regressions, show returns shrinking well before this point, and the
 * coaching convention (maximum recoverable volume) puts most people's limit
 * near or above 20 sets, where more volume mostly adds fatigue. This is a
 * guide for people training a muscle for growth, not a prescription: a muscle
 * you only maintain can sit lower, and advanced lifters may tolerate more.
 */
export const WEEKLY_HARD_SETS_MIN = 10;
export const WEEKLY_HARD_SETS_MAX = 20;

/**
 * A muscle counts as one the person trains when it had any hard sets in this
 * many weeks (this one included). A muscle that fell to zero after being
 * trained is flagged under; one never trained is not listed.
 */
export const VOLUME_REGULAR_LOOKBACK_WEEKS = 4;

/** Whether a logged set counts as a hard set. Warm-ups never do. */
export function isHardSet(set: MuscleSet): boolean {
  if (isWarmupSetType(set.set_type)) return false;
  if ((Number(set.reps) || 0) <= 0 && (Number(set.duration) || 0) <= 0) {
    return false;
  }
  // RIR is the more direct record of effort, so it wins when both are set.
  if (set.rir != null && Number.isFinite(Number(set.rir))) {
    return Number(set.rir) <= HARD_SET_MAX_RIR;
  }
  if (set.rpe != null && Number.isFinite(Number(set.rpe))) {
    return Number(set.rpe) >= HARD_SET_MIN_RPE;
  }
  return true;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Weighted hard sets per muscle. A muscle named as both primary and secondary
 * for one exercise is counted once, as primary.
 */
export function hardSetsByMuscle(
  entries: readonly MuscleEntry[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    const hardSets = (entry.sets ?? []).filter(isHardSet).length;
    if (hardSets === 0) continue;
    const primary = primaryMusclesOf(entry);
    for (const muscle of primary) {
      totals[muscle] =
        (totals[muscle] ?? 0) + hardSets * PRIMARY_MUSCLE_SET_WEIGHT;
    }
    for (const muscle of secondaryMusclesOf(entry)) {
      if (primary.includes(muscle)) continue;
      totals[muscle] =
        (totals[muscle] ?? 0) + hardSets * SECONDARY_MUSCLE_SET_WEIGHT;
    }
  }
  for (const muscle of Object.keys(totals)) {
    totals[muscle] = round1(totals[muscle] ?? 0);
  }
  return totals;
}

/**
 * Where a week's total sits against the range. Below the range in a week that
 * is still going is `building`, not a flag; only a finished week is `under`.
 */
export function volumeStatus(
  sets: number,
  weekComplete: boolean
): VolumeStatus {
  if (sets > WEEKLY_HARD_SETS_MAX) return 'over';
  if (sets >= WEEKLY_HARD_SETS_MIN) return 'inRange';
  return weekComplete ? 'under' : 'building';
}

/** Entries whose day falls in the week that starts on `weekStart`. */
export function entriesInWeek<T extends { entry_date?: string }>(
  entries: readonly T[],
  weekStart: string
): T[] {
  const weekEnd = addDays(weekStart, 6);
  return entries.filter((entry) => {
    const day = entry.entry_date?.slice(0, 10);
    return day != null && day >= weekStart && day <= weekEnd;
  });
}

/**
 * This week against last week, per muscle, for every muscle with hard sets in
 * the last `VOLUME_REGULAR_LOOKBACK_WEEKS` weeks. Entries after `today` are
 * ignored. Most volume this week first, then last week, then name.
 */
export function buildMuscleVolume(
  entries: readonly MuscleEntry[],
  today: string,
  firstDayOfWeek: number = 1
): { rows: MuscleVolumeRow[]; thisWeekStart: string; lastWeekStart: string } {
  const thisWeekStart = weekStartOf(today, firstDayOfWeek);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lookbackStart = addDays(
    thisWeekStart,
    -7 * (VOLUME_REGULAR_LOOKBACK_WEEKS - 1)
  );
  const upToToday = entries.filter(
    (entry) => (entry.entry_date?.slice(0, 10) ?? '') <= today
  );
  const thisWeek = hardSetsByMuscle(entriesInWeek(upToToday, thisWeekStart));
  const lastWeek = hardSetsByMuscle(entriesInWeek(upToToday, lastWeekStart));
  const regular = new Set<string>();
  for (
    let start = lookbackStart;
    start <= thisWeekStart;
    start = addDays(start, 7)
  ) {
    for (const muscle of Object.keys(
      hardSetsByMuscle(entriesInWeek(upToToday, start))
    )) {
      regular.add(muscle);
    }
  }
  const rows = [...regular].map((muscle) => {
    const thisSets = thisWeek[muscle] ?? 0;
    const lastSets = lastWeek[muscle] ?? 0;
    return {
      muscle,
      thisWeek: thisSets,
      lastWeek: lastSets,
      thisWeekStatus: volumeStatus(thisSets, false),
      lastWeekStatus: volumeStatus(lastSets, true),
    };
  });
  rows.sort(
    (a, b) =>
      b.thisWeek - a.thisWeek ||
      b.lastWeek - a.lastWeek ||
      a.muscle.localeCompare(b.muscle)
  );
  return { rows, thisWeekStart, lastWeekStart };
}
