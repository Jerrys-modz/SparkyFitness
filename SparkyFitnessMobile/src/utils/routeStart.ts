import { haversineMeters } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { METERS_PER_MILE } from './gpsRecording';
import type { DistanceUnit } from './routeDisplay';

/** Within this of the line counts as being on the route (the watch's tracker uses 40 m too). */
export const ON_ROUTE_METERS = 40;

const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Metres from `p` to the segment `a`-`b`, on a flat map around `a`. */
function distanceToSegmentMeters(p: LatLon, a: LatLon, b: LatLon): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const toXY = (q: LatLon): [number, number] => [
    (((q.lon - a.lon) * Math.PI) / 180) * cosLat * EARTH_RADIUS_M,
    (((q.lat - a.lat) * Math.PI) / 180) * EARTH_RADIUS_M,
  ];
  const [px, py] = toXY(p);
  const [bx, by] = toXY(b);
  const lengthSquared = bx * bx + by * by;
  const t =
    lengthSquared > 0
      ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared))
      : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

/** Metres from `p` to the nearest point of the line through `route`. */
export function distanceToRouteMeters(
  p: LatLon,
  route: readonly LatLon[]
): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) return haversineMeters(p, route[0]);
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegmentMeters(p, route[i], route[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Whether any recorded position came within `ON_ROUTE_METERS` of the route
 * line. Positions outside the route's bounding box (grown by that distance)
 * are skipped without measuring, so a long track that never gets near the
 * route is cheap to check.
 */
export function reachedRoute(
  track: readonly LatLon[],
  route: readonly LatLon[]
): boolean {
  if (route.length === 0) return false;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of route) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const latMargin = (ON_ROUTE_METERS / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonMargin =
    latMargin /
    Math.max(0.01, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  for (const p of track) {
    if (
      p.lat < minLat - latMargin ||
      p.lat > maxLat + latMargin ||
      p.lon < minLon - lonMargin ||
      p.lon > maxLon + lonMargin
    ) {
      continue;
    }
    if (distanceToRouteMeters(p, route) <= ON_ROUTE_METERS) return true;
  }
  return false;
}

/** How far away the route's first point is from `position`. */
export function distanceToStartMeters(
  position: LatLon,
  route: readonly LatLon[]
): number | null {
  return route.length > 0 ? haversineMeters(position, route[0]) : null;
}

/** "600 m" or "1.2 km" (feet and miles with the miles setting). */
export function formatStartDistance(
  meters: number,
  unit: DistanceUnit
): string {
  if (unit === 'miles') {
    const feet = meters * 3.28084;
    if (meters < 0.1 * METERS_PER_MILE) {
      return `${formatLocalizedNumber(Math.max(10, Math.round(feet / 10) * 10))} ft`;
    }
    return `${formatLocalizedNumber(meters / METERS_PER_MILE, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (meters >= 1000) {
    return `${formatLocalizedNumber(meters / 1000, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} km`;
  }
  return `${formatLocalizedNumber(Math.max(10, Math.round(meters / 10) * 10))} m`;
}
