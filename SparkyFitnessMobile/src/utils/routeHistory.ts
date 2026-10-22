import type { RouteRun } from '@workspace/shared';
import { formatPace, METERS_PER_KM, METERS_PER_MILE } from './gpsRecording';

/** A run this many seconds faster or slower than usual, as a share, is a change. */
const STEADY_SHARE = 0.02;
/** How many earlier runs "usual" averages over. */
const TREND_BASELINE_RUNS = 3;
/** The most runs the trend bars draw. */
export const TREND_MAX_BARS = 8;

const isTimed = (run: RouteRun): boolean =>
  Number.isFinite(run.durationSeconds) && run.durationSeconds > 0;

/**
 * Whether the run `entryId` is a new best over its route: strictly faster than
 * every other logged run. `previousBestSeconds` is the best before it, or null
 * when it is the first timed run (nothing to beat, so never a "best"). Null
 * when the run is not in the list yet.
 */
export function routeBestNote(
  runs: readonly RouteRun[],
  entryId: string
): { isRouteBest: boolean; previousBestSeconds: number | null } | null {
  const current = runs.find((run) => run.entryId === entryId);
  if (!current || !isTimed(current)) return null;
  const others = runs
    .filter((run) => run.entryId !== entryId && isTimed(run))
    .map((run) => run.durationSeconds);
  if (others.length === 0) {
    return { isRouteBest: false, previousBestSeconds: null };
  }
  const previousBestSeconds = Math.min(...others);
  return {
    isRouteBest: current.durationSeconds < previousBestSeconds,
    previousBestSeconds,
  };
}

export interface RouteTrend {
  direction: 'faster' | 'slower' | 'steady';
  /** Seconds the newest run differs from the average of the runs before it. */
  deltaSeconds: number;
  /** Durations oldest to newest, at most `TREND_MAX_BARS`, for a bar per run. */
  durations: number[];
}

/**
 * How the newest timed run compares with the few before it. Needs two timed
 * runs; `runs` is newest first, as the server lists them. Untimed runs are
 * ignored.
 */
export function routeTrend(runs: readonly RouteRun[]): RouteTrend | null {
  const timed = runs.filter(isTimed);
  if (timed.length < 2) return null;
  const [latest, ...earlier] = timed;
  const baseline = earlier.slice(0, TREND_BASELINE_RUNS);
  const average =
    baseline.reduce((sum, run) => sum + run.durationSeconds, 0) /
    baseline.length;
  const deltaSeconds = Math.round(latest.durationSeconds - average);
  const direction =
    Math.abs(deltaSeconds) < average * STEADY_SHARE
      ? 'steady'
      : deltaSeconds < 0
        ? 'faster'
        : 'slower';
  return {
    direction,
    deltaSeconds,
    durations: timed
      .slice(0, TREND_MAX_BARS)
      .map((run) => run.durationSeconds)
      .reverse(),
  };
}

/** "5:12" per km or mile for a pace the server gives in seconds per km. */
export function formatRunPace(
  paceSecPerKm: number | null,
  unit: 'km' | 'miles'
): string {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm)) return '—';
  return formatPace(
    unit === 'miles'
      ? paceSecPerKm * (METERS_PER_MILE / METERS_PER_KM)
      : paceSecPerKm
  );
}
