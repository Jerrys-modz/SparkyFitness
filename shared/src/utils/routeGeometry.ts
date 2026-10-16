import type { RoutePoint } from "../schemas/api/Route.api.zod.ts";

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points. */
export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the path through the points, in metres. */
export function routeDistanceMeters(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Total climb in metres. Altitude wobble is ignored: a rise only counts once it
 * exceeds `thresholdM` from the last counted height. Null if the points carry
 * no altitude.
 */
export function routeElevationGainMeters(
  points: readonly RoutePoint[],
  thresholdM = 2,
): number | null {
  let reference: number | null = null;
  let gain = 0;
  for (const point of points) {
    if (point.alt === undefined) continue;
    if (reference === null) {
      reference = point.alt;
      continue;
    }
    const delta = point.alt - reference;
    if (delta >= thresholdM) {
      gain += delta;
      reference = point.alt;
    } else if (delta <= -thresholdM) {
      reference = point.alt;
    }
  }
  return reference === null ? null : gain;
}

/** Distance in metres from `p` to the segment `a`-`b` (local flat approximation). */
function distanceToSegmentMeters(
  p: RoutePoint,
  a: RoutePoint,
  b: RoutePoint,
): number {
  const cosLat = Math.cos(toRad(a.lat));
  const toXY = (q: RoutePoint): [number, number] => [
    toRad(q.lon - a.lon) * cosLat * EARTH_RADIUS_M,
    toRad(q.lat - a.lat) * EARTH_RADIUS_M,
  ];
  const [px, py] = toXY(p);
  const [bx, by] = toXY(b);
  const lengthSq = bx * bx + by * by;
  if (lengthSq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
  return Math.hypot(px - t * bx, py - t * by);
}

function douglasPeucker(
  points: readonly RoutePoint[],
  toleranceM: number,
): number[] {
  const keep = new Set<number>([0, points.length - 1]);
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let farthest = -1;
    let farthestDistance = toleranceM;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegmentMeters(points[i], points[start], points[end]);
      if (d > farthestDistance) {
        farthest = i;
        farthestDistance = d;
      }
    }
    if (farthest !== -1) {
      keep.add(farthest);
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return [...keep].sort((x, y) => x - y);
}

/** Keeps the first and last of `indexes` and spreads the rest evenly. */
function sampleEvenly(indexes: number[], count: number): number[] {
  if (indexes.length <= count) return indexes;
  const sampled: number[] = [];
  const last = indexes.length - 1;
  for (let i = 0; i < count; i++) {
    sampled.push(indexes[Math.round((i * last) / (count - 1))]);
  }
  return [...new Set(sampled)];
}

/** Douglas-Peucker is quadratic in the worst case, so it never sees more than this. */
const MAX_SIMPLIFY_INPUT = 4000;
const MAX_WIDENINGS = 12;

/**
 * Thins a track to at most `maxPoints`: points closer than 2 m to the last kept
 * one go first, then Douglas-Peucker with a tolerance that widens until the
 * track fits. Returns the kept points and, for each, its index in the input
 * (so cues can be re-pointed). Bounded work even for adversarial input.
 */
export function simplifyRoute(
  points: readonly RoutePoint[],
  maxPoints: number,
  toleranceM = 3,
): { points: RoutePoint[]; sourceIndexes: number[] } {
  if (points.length <= 2) {
    return {
      points: [...points],
      sourceIndexes: points.map((_, i) => i),
    };
  }
  const last = points.length - 1;

  let candidates: number[] = [0];
  for (let i = 1; i < last; i++) {
    if (
      haversineMeters(points[candidates[candidates.length - 1]], points[i]) >= 2
    ) {
      candidates.push(i);
    }
  }
  candidates.push(last);
  candidates = sampleEvenly(candidates, MAX_SIMPLIFY_INPUT);

  const subset = candidates.map((i) => points[i]);
  let tolerance = toleranceM;
  let kept = douglasPeucker(subset, tolerance);
  for (let n = 0; kept.length > maxPoints && n < MAX_WIDENINGS; n++) {
    tolerance *= 1.5;
    kept = douglasPeucker(subset, tolerance);
  }
  let sourceIndexes = kept.map((i) => candidates[i]);
  if (sourceIndexes.length > maxPoints) {
    sourceIndexes = sampleEvenly(sourceIndexes, maxPoints);
  }
  return {
    points: sourceIndexes.map((i) => points[i]),
    sourceIndexes,
  };
}

export interface RouteBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export function routeBounds(points: readonly RoutePoint[]): RouteBounds | null {
  if (points.length === 0) return null;
  const bounds = {
    minLat: points[0].lat,
    minLon: points[0].lon,
    maxLat: points[0].lat,
    maxLon: points[0].lon,
  };
  for (const p of points) {
    bounds.minLat = Math.min(bounds.minLat, p.lat);
    bounds.minLon = Math.min(bounds.minLon, p.lon);
    bounds.maxLat = Math.max(bounds.maxLat, p.lat);
    bounds.maxLon = Math.max(bounds.maxLon, p.lon);
  }
  return bounds;
}
