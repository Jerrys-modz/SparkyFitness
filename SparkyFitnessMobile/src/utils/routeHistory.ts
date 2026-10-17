import type { RouteRun } from '@workspace/shared';
import { formatPace, METERS_PER_KM, METERS_PER_MILE } from './gpsRecording';

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
  if (!current || current.durationSeconds <= 0) return null;
  const others = runs
    .filter((run) => run.entryId !== entryId && run.durationSeconds > 0)
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

/** "5:12" per km or mile for a pace the server gives in seconds per km. */
export function formatRunPace(
  paceSecPerKm: number | null,
  unit: 'km' | 'miles'
): string {
  if (paceSecPerKm === null) return '—';
  return formatPace(
    unit === 'miles'
      ? paceSecPerKm * (METERS_PER_MILE / METERS_PER_KM)
      : paceSecPerKm
  );
}
