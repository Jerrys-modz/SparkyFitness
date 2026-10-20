import type {
  RoutePoint,
  RouteStop,
  RouteStopKind,
} from '../schemas/api/Route.api.zod.ts';
import {
  distanceToSegment,
  haversineMeters,
  localProjector,
} from './routeGeometry.ts';

export const ROUTE_STOP_KINDS: readonly RouteStopKind[] = [
  'water',
  'toilets',
  'cafe',
  'viewpoint',
];

/** A stop as the map data has it, before it is placed along a route. */
export interface RouteStopCandidate {
  kind: RouteStopKind;
  name: string | null;
  lat: number;
  lon: number;
}

/**
 * Places candidates along a route: how far from the start the nearest point
 * of the route is, and how far off it the stop lies. Candidates further than
 * `maxOffRouteM` are dropped; the rest come back in route order.
 */
export function locateStopsAlongRoute(
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[],
  candidates: readonly RouteStopCandidate[],
  maxOffRouteM: number
): RouteStop[] {
  const first = points[0];
  if (!first || points.length < 2) return [];
  const project = localProjector(first);
  const line = points.map(project);

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      (cumulative[i - 1] as number) +
        haversineMeters(points[i - 1] as RoutePoint, points[i] as RoutePoint)
    );
  }

  const located: RouteStop[] = [];
  for (const candidate of candidates) {
    const at = project(candidate);
    let best = { distance: Infinity, along: 0 };
    for (let i = 1; i < line.length; i++) {
      const hit = distanceToSegment(
        at,
        line[i - 1] as { x: number; y: number },
        line[i] as { x: number; y: number }
      );
      if (hit.distance < best.distance) {
        const segment =
          (cumulative[i] as number) - (cumulative[i - 1] as number);
        best = {
          distance: hit.distance,
          along: (cumulative[i - 1] as number) + hit.t * segment,
        };
      }
    }
    if (best.distance <= maxOffRouteM) {
      located.push({
        kind: candidate.kind,
        name: candidate.name,
        lat: candidate.lat,
        lon: candidate.lon,
        distanceFromStartM: Math.round(best.along),
        offRouteM: Math.round(best.distance),
      });
    }
  }
  return located.sort((a, b) => a.distanceFromStartM - b.distanceFromStartM);
}

export function countRouteStops(
  stops: readonly Pick<RouteStop, 'kind'>[]
): Record<RouteStopKind, number> {
  const counts: Record<RouteStopKind, number> = {
    water: 0,
    toilets: 0,
    cafe: 0,
    viewpoint: 0,
  };
  for (const stop of stops) counts[stop.kind]++;
  return counts;
}
