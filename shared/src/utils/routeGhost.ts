import {
  ROUTE_GHOST_INTERVAL_M,
  type RouteGhost,
} from '../schemas/api/Route.api.zod.ts';
import { haversineMeters } from './routeGeometry.ts';

/** A recorded fix: only the position and when it was taken are needed. */
export interface GhostTrackPoint {
  t: string;
  lat: number;
  lon: number;
}

/**
 * Active seconds at every `intervalM` of route progress, for the best run over
 * a route of `routeDistanceM` metres that took `durationSeconds`.
 *
 * The run's GPS timeline gives the shape (fast early, slow late): its distance
 * is stretched to the route's length, because the run followed the route and
 * the track's own length differs by GPS noise, and its clock is stretched to
 * the logged duration, which is active time and so leaves out pauses. A track
 * that is missing, has no usable timestamps or has not moved falls back to an
 * even pace over the total time (`constant_pace`), so the ghost still exists
 * for a run imported without a track.
 */
export function buildGhostSplits(input: {
  track: readonly GhostTrackPoint[] | null;
  routeDistanceM: number;
  durationSeconds: number;
  intervalM?: number;
}): Pick<RouteGhost, 'splits' | 'source' | 'intervalM'> | null {
  const intervalM = input.intervalM ?? ROUTE_GHOST_INTERVAL_M;
  const { routeDistanceM, durationSeconds } = input;
  if (!(routeDistanceM > 0) || !(durationSeconds > 0)) return null;

  const count = Math.ceil(routeDistanceM / intervalM);
  const knots = Array.from({ length: count }, (_, i) =>
    Math.min((i + 1) * intervalM, routeDistanceM)
  );

  const fromTrack = splitsFromTrack(
    input.track,
    knots,
    routeDistanceM,
    durationSeconds
  );
  if (fromTrack) return { splits: fromTrack, source: 'track', intervalM };

  return {
    splits: knots.map((d) =>
      Math.round((durationSeconds * d) / routeDistanceM)
    ),
    source: 'constant_pace',
    intervalM,
  };
}

function splitsFromTrack(
  track: readonly GhostTrackPoint[] | null,
  knots: readonly number[],
  routeDistanceM: number,
  durationSeconds: number
): number[] | null {
  if (!track || track.length < 2) return null;

  // Distance along the track and time since the first fix, one entry per fix
  // whose timestamp reads and does not go backwards.
  const along: number[] = [];
  const clock: number[] = [];
  let previous: GhostTrackPoint | null = null;
  let start = 0;
  for (const point of track) {
    const at = Date.parse(point.t);
    if (!Number.isFinite(at)) continue;
    if (previous === null) {
      start = at;
      along.push(0);
      clock.push(0);
    } else {
      const last = clock.length - 1;
      if (at - start < clock[last] * 1000) continue;
      along.push(along[last] + haversineMeters(previous, point));
      clock.push((at - start) / 1000);
    }
    previous = point;
  }
  const trackLength = along[along.length - 1] ?? 0;
  const trackSeconds = clock[clock.length - 1] ?? 0;
  if (along.length < 2 || !(trackLength > 0) || !(trackSeconds > 0)) {
    return null;
  }

  const scaleDistance = trackLength / routeDistanceM;
  const scaleTime = durationSeconds / trackSeconds;
  let cursor = 1;
  let floor = 0;
  return knots.map((knot, i) => {
    const target = knot * scaleDistance;
    while (cursor < along.length - 1 && along[cursor] < target) cursor++;
    const span = along[cursor] - along[cursor - 1];
    const fraction =
      span > 0
        ? Math.min(1, Math.max(0, (target - along[cursor - 1]) / span))
        : 1;
    const seconds =
      (clock[cursor - 1] + fraction * (clock[cursor] - clock[cursor - 1])) *
      scaleTime;
    // The finish is the logged time exactly; never run backwards.
    const value =
      i === knots.length - 1 ? durationSeconds : Math.round(seconds);
    floor = Math.max(floor, value);
    return floor;
  });
}
