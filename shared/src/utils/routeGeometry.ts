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
    total += haversineMeters(
      points[i - 1] as RoutePoint,
      points[i] as RoutePoint,
    );
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
      const d = distanceToSegmentMeters(
        points[i] as RoutePoint,
        points[start] as RoutePoint,
        points[end] as RoutePoint,
      );
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
    sampled.push(indexes[Math.round((i * last) / (count - 1))] as number);
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
      haversineMeters(
        points[candidates[candidates.length - 1] as number] as RoutePoint,
        points[i] as RoutePoint,
      ) >= 2
    ) {
      candidates.push(i);
    }
  }
  candidates.push(last);
  candidates = sampleEvenly(candidates, MAX_SIMPLIFY_INPUT);

  const subset = candidates.map((i) => points[i] as RoutePoint);
  let tolerance = toleranceM;
  let kept = douglasPeucker(subset, tolerance);
  for (let n = 0; kept.length > maxPoints && n < MAX_WIDENINGS; n++) {
    tolerance *= 1.5;
    kept = douglasPeucker(subset, tolerance);
  }
  let sourceIndexes = kept.map((i) => candidates[i] as number);
  if (sourceIndexes.length > maxPoints) {
    sourceIndexes = sampleEvenly(sourceIndexes, maxPoints);
  }
  return {
    points: sourceIndexes.map((i) => points[i] as RoutePoint),
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
  const first = points[0];
  if (!first) return null;
  const bounds = {
    minLat: first.lat,
    minLon: first.lon,
    maxLat: first.lat,
    maxLon: first.lon,
  };
  for (const p of points) {
    bounds.minLat = Math.min(bounds.minLat, p.lat);
    bounds.minLon = Math.min(bounds.minLon, p.lon);
    bounds.maxLat = Math.max(bounds.maxLat, p.lat);
    bounds.maxLon = Math.max(bounds.maxLon, p.lon);
  }
  return bounds;
}

type LatLon = Pick<RoutePoint, "lat" | "lon">;
type Xy = { x: number; y: number };

/**
 * An equirectangular projection around `origin`, in metres. Accurate to a
 * few centimetres over the distances a route spans, and far cheaper than
 * great-circle maths for nearest-point searches.
 */
export function localProjector(origin: LatLon): (p: LatLon) => Xy {
  const metresPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const metresPerDegLon = metresPerDegLat * Math.cos(toRad(origin.lat));
  return (p) => ({
    x: (p.lon - origin.lon) * metresPerDegLon,
    y: (p.lat - origin.lat) * metresPerDegLat,
  });
}

/** Distance from `p` to the segment `a`-`b`, and where along it (0 to 1). */
export function distanceToSegment(
  p: Xy,
  a: Xy,
  b: Xy,
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
        );
  return {
    distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)),
    t,
  };
}

const MAX_OVERLAP_SAMPLES = 20000;

/** Points every `stepM` along the line, always including both ends. */
function sampleLine(line: readonly Xy[], stepM: number): Xy[] {
  const samples: Xy[] = [];
  const first = line[0];
  if (!first) return samples;
  samples.push(first);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Xy;
    const b = line[i] as Xy;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const pieces = Math.max(1, Math.ceil(length / stepM));
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return samples;
}

/**
 * The share (0 to 1) of route `a` that lies within `toleranceM` of route `b`.
 * Both are sampled along their length, so sparse points do not matter, and
 * the work is bounded however long the routes are.
 */
export function routeOverlapFraction(
  a: readonly RoutePoint[],
  b: readonly RoutePoint[],
  toleranceM = 30,
): number {
  const origin = a[0];
  if (!origin || a.length < 2 || b.length < 2) return 0;
  const project = localProjector(origin);
  const lineA = a.map(project);
  const lineB = b.map(project);

  const totalM = routeDistanceMeters(a) + routeDistanceMeters(b);
  const stepM = Math.max(toleranceM / 2, totalM / MAX_OVERLAP_SAMPLES);
  const samplesA = sampleLine(lineA, stepM);
  const samplesB = sampleLine(lineB, stepM);

  const cell = toleranceM;
  const grid = new Map<string, Xy[]>();
  for (const s of samplesB) {
    const key = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(s);
    else grid.set(key, [s]);
  }

  let near = 0;
  for (const s of samplesA) {
    const cx = Math.floor(s.x / cell);
    const cy = Math.floor(s.y / cell);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        found =
          bucket?.some((q) => Math.hypot(q.x - s.x, q.y - s.y) <= toleranceM) ??
          false;
      }
    }
    if (found) near++;
  }
  return near / samplesA.length;
}

/**
 * Whether two routes really are different shapes: false when most of each
 * lies on the other.
 */
export function routesAreDistinct(
  a: readonly RoutePoint[],
  b: readonly RoutePoint[],
  { toleranceM = 30, maxOverlap = 0.7 } = {},
): boolean {
  const overlap = Math.min(
    routeOverlapFraction(a, b, toleranceM),
    routeOverlapFraction(b, a, toleranceM),
  );
  return overlap < maxOverlap;
}
