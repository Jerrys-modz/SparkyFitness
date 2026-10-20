import {
  ROUTE_MAX_STORED_POINTS,
  routeDistanceMeters,
  routeElevationGainMeters,
  simplifyRoute,
  type RouteCue,
  type RoutePoint,
} from '@workspace/shared';

export class InvalidRouteError extends Error {}

export interface PreparedRoute {
  points: RoutePoint[];
  cues: RouteCue[];
  distanceM: number;
  elevationGainM: number | null;
}

/** Rounds to ~1 cm of latitude, which keeps stored tracks compact. */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Turns a raw track into what is stored: consecutive duplicates removed, thinned
 * to at most ROUTE_MAX_STORED_POINTS, with distance and climb measured on the
 * full track (so thinning never shortens the route) and cues re-pointed at the
 * nearest kept point.
 */
export function prepareRoute(
  rawPoints: readonly RoutePoint[],
  rawCues: readonly RouteCue[] = []
): PreparedRoute {
  const indexMap: number[] = [];
  const deduped: RoutePoint[] = [];
  rawPoints.forEach((point, sourceIndex) => {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.lat === point.lat && previous.lon === point.lon) {
      indexMap[sourceIndex] = deduped.length - 1;
      return;
    }
    deduped.push(point);
    indexMap[sourceIndex] = deduped.length - 1;
  });

  const distanceM = routeDistanceMeters(deduped);
  if (deduped.length < 2 || distanceM < 10) {
    throw new InvalidRouteError('A route needs to be at least 10 m long');
  }

  const simplified = simplifyRoute(deduped, ROUTE_MAX_STORED_POINTS);
  const points = simplified.points.map((point) => ({
    lat: round6(point.lat),
    lon: round6(point.lon),
    ...(point.alt === undefined
      ? {}
      : { alt: Math.round(point.alt * 10) / 10 }),
  }));

  const keptIndexes = simplified.sourceIndexes;
  const nearestKept = (dedupedIndex: number): number => {
    let best = 0;
    for (let i = 0; i < keptIndexes.length; i++) {
      if (
        Math.abs(keptIndexes[i] - dedupedIndex) <
        Math.abs(keptIndexes[best] - dedupedIndex)
      ) {
        best = i;
      }
    }
    return best;
  };
  const cues = rawCues
    .filter((cue) => cue.index < rawPoints.length)
    .map((cue) => ({ ...cue, index: nearestKept(indexMap[cue.index]) }))
    .sort((a, b) => a.index - b.index);

  return {
    points,
    cues,
    distanceM: Math.round(distanceM * 10) / 10,
    elevationGainM: (() => {
      const gain = routeElevationGainMeters(deduped);
      return gain === null ? null : Math.round(gain * 10) / 10;
    })(),
  };
}
