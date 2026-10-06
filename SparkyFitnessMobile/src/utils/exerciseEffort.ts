import {
  effortAdjustedOneRepMaxKg,
  epleyOneRepMaxKg,
  type ExerciseSessionResponse,
} from '@workspace/shared';
import { isWarmupSetType } from './workoutSession';

/** How many of the most recent sessions with an RPE the trend shows. */
export const EFFORT_TREND_SESSIONS = 10;

export interface EffortTrendPoint {
  date: string;
  /** Average RPE of the session's working sets that have one. */
  avgRpe: number;
}

export interface EffortOneRepMax {
  /** Best Epley estimate over the sets that have an RPE, ignoring the RPE. */
  plainKg: number;
  /** The same sets, counting the reps their RPE says were left. */
  effortKg: number;
}

export interface ExerciseEffortSummary {
  /** Oldest first, at most `EFFORT_TREND_SESSIONS`. */
  trend: EffortTrendPoint[];
  /** Null when no working set with a weight, reps and RPE has been logged. */
  oneRepMax: EffortOneRepMax | null;
}

/**
 * The effort side of an exercise's history: average RPE per session, and the
 * best 1RM estimate with and without counting the reps left. `sessions` is the
 * history endpoint's output; a preset session carries every exercise it held,
 * so only `exerciseId`'s entries are read. Warm-ups never count. The 1RM is
 * only worked out for `includeOneRepMax` (a plain weight × reps lift): a
 * bodyweight set's load is not its weight.
 */
export function buildExerciseEffortSummary(
  sessions: readonly ExerciseSessionResponse[],
  exerciseId: string,
  includeOneRepMax: boolean
): ExerciseEffortSummary {
  const points: EffortTrendPoint[] = [];
  let plainKg = 0;
  let effortKg = 0;

  for (const session of sessions) {
    const entries =
      session.type === 'preset'
        ? session.exercises.filter((entry) => entry.exercise_id === exerciseId)
        : [session];
    let rpeSum = 0;
    let rpeCount = 0;
    for (const entry of entries) {
      for (const set of entry.sets) {
        if (isWarmupSetType(set.set_type)) continue;
        if (set.rpe == null || !Number.isFinite(set.rpe)) continue;
        rpeSum += set.rpe;
        rpeCount++;
        if (includeOneRepMax) {
          plainKg = Math.max(plainKg, epleyOneRepMaxKg(set.weight, set.reps));
          effortKg = Math.max(
            effortKg,
            effortAdjustedOneRepMaxKg(set.weight, set.reps, set.rpe)
          );
        }
      }
    }
    if (rpeCount > 0 && session.entry_date) {
      points.push({ date: session.entry_date, avgRpe: rpeSum / rpeCount });
    }
  }

  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    trend: points.slice(-EFFORT_TREND_SESSIONS),
    oneRepMax: effortKg > 0 ? { plainKg, effortKg } : null,
  };
}
