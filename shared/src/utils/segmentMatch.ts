import type { RoutePoint } from '../schemas/api/Route.api.zod.ts';
import {
  distanceToSegment,
  haversineMeters,
  localProjector,
  routeBounds,
  routeDistanceMeters,
  simplifyRoute,
  type RouteBounds,
} from './routeGeometry.ts';

type LatLon = Pick<RoutePoint, 'lat' | 'lon'>;
type Xy = { x: number; y: number };

/** A stored segment keeps at most this many points. */
export const SEGMENT_MAX_POINTS = 400;
/** The shortest and longest stretch worth timing, in metres. */
export const SEGMENT_MIN_LENGTH_M = 100;
export const SEGMENT_MAX_LENGTH_M = 100_000;

/** One recorded fix; `tMs` is epoch milliseconds. */
export interface TrackFix extends LatLon {
  tMs: number;
  /** Horizontal accuracy radius in metres, when the device reported one. */
  hacc?: number;
}

export interface SegmentMatchOptions {
  /** How far from the segment line a fix may be, in metres. */
  toleranceM?: number;
  /** Fixes with a worse accuracy radius than this are not trusted. */
  maxAccuracyM?: number;
  /** Two trusted fixes inside an effort may be at most this far apart in time. */
  maxGapSeconds?: number;
  /** ...and at most this far apart in space. */
  maxGapM?: number;
  /** Faster than this between two fixes is a GPS jump, not movement. */
  maxSpeedMps?: number;
  /** Most the track may slide back along the line (jitter) before it is a turn-around. */
  backslideM?: number;
}

export const DEFAULT_SEGMENT_MATCH: Required<SegmentMatchOptions> = {
  toleranceM: 25,
  maxAccuracyM: 50,
  maxGapSeconds: 30,
  maxGapM: 150,
  maxSpeedMps: 25,
  backslideM: 25,
};

/** One timed pass over a segment. */
export interface SegmentPass {
  startMs: number;
  endMs: number;
  /** Seconds between crossing the start and the end of the segment. */
  elapsedSeconds: number;
  avgSpeedMps: number;
  /** Trusted fixes between the start and the end gates. */
  fixCount: number;
}

export interface SegmentGeometry {
  points: readonly LatLon[];
  lengthM: number;
}

/** Cumulative length at every point, starting at 0. */
function cumulativeLengths(line: readonly Xy[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Xy;
    const b = line[i] as Xy;
    out.push((out[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
}

interface Placement {
  /** Metres along the line; below 0 before the start and above the length after the end. */
  s: number;
  /** Distance to the line itself (the ends are points, not infinite). */
  d: number;
}

/** Where `p` sits along `line` and how far it is from it. */
function place(
  p: Xy,
  line: readonly Xy[],
  cumulative: readonly number[]
): Placement {
  let bestD = Infinity;
  let bestS = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Xy;
    const b = line[i] as Xy;
    const { distance, t } = distanceToSegment(p, a, b);
    if (distance < bestD) {
      bestD = distance;
      bestS =
        (cumulative[i - 1] as number) +
        t * ((cumulative[i] as number) - (cumulative[i - 1] as number));
    }
  }
  // Beyond either end the position keeps running along the end piece, so the
  // moment a fix crosses the start or end line can be interpolated.
  const length = cumulative[cumulative.length - 1] as number;
  const first = line[0] as Xy;
  const second = line[1] as Xy;
  const lastA = line[line.length - 2] as Xy;
  const last = line[line.length - 1] as Xy;
  const headLen = (cumulative[1] as number) || 1;
  const headS =
    ((p.x - first.x) * (second.x - first.x) +
      (p.y - first.y) * (second.y - first.y)) /
    headLen;
  if (headS < 0) bestS = headS;
  const tailLen = length - (cumulative[cumulative.length - 2] as number) || 1;
  const tailS =
    length +
    ((p.x - last.x) * (last.x - lastA.x) +
      (p.y - last.y) * (last.y - lastA.y)) /
      tailLen;
  if (tailS > length) bestS = tailS;
  return { s: bestS, d: bestD };
}

/** Signed sideways offset of `p` from the straight line `a` to `b` (left is positive). */
function lateralOffset(p: Xy, a: Xy, b: Xy): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

/** A pass starts here: `s` went from below 0 to 0 or more between two fixes. */
interface Crossing {
  index: number; // the later fix
  tMs: number;
  lateralM: number;
}

function crossStart(
  prev: { s: number; xy: Xy; tMs: number },
  next: { s: number; xy: Xy; tMs: number },
  head: { a: Xy; b: Xy }
): Crossing | null {
  if (!(prev.s < 0 && next.s >= 0)) return null;
  const f = (0 - prev.s) / (next.s - prev.s);
  const l0 = lateralOffset(prev.xy, head.a, head.b);
  const l1 = lateralOffset(next.xy, head.a, head.b);
  return {
    index: -1,
    tMs: prev.tMs + f * (next.tMs - prev.tMs),
    lateralM: Math.abs(l0 + f * (l1 - l0)),
  };
}

/**
 * Every timed pass of `track` over `segment`, in time order.
 *
 * A pass crosses the start line going forward, stays within `toleranceM` of
 * the line, and crosses the end line; the time is interpolated between the
 * two fixes either side of each crossing. A pass is ignored (not an error)
 * when it fails a quality check: a fix with a poor accuracy radius, a gap in
 * time or space, an impossible jump, a long detour or a turn-around inside
 * the corridor. A track that starts or ends inside the first or last
 * `toleranceM` of the segment is timed from that fix, its crossing time
 * extrapolated at the speed of the next stretch.
 *
 * The length of the path travelled is deliberately not checked against the
 * segment length: at walking pace ordinary GPS jitter makes the recorded path
 * several times longer than the real one. Doubling back is caught by
 * `backslideM`, and cutting corners or detouring by the corridor.
 */
export function findSegmentPasses(
  segment: SegmentGeometry,
  track: readonly TrackFix[],
  options: SegmentMatchOptions = {}
): SegmentPass[] {
  const opt = { ...DEFAULT_SEGMENT_MATCH, ...options };
  if (segment.points.length < 2 || segment.lengthM <= 0) return [];

  const project = localProjector(segment.points[0] as LatLon);
  const line = segment.points.map(project);
  const cumulative = cumulativeLengths(line);
  const length = cumulative[cumulative.length - 1] as number;
  if (length <= 0) return [];
  const head = { a: line[0] as Xy, b: line[1] as Xy };
  const tail = {
    a: line[line.length - 2] as Xy,
    b: line[line.length - 1] as Xy,
  };

  // Untrusted fixes are dropped; the gap checks below then catch the hole.
  const fixes = track
    .filter(
      (f) =>
        Number.isFinite(f.tMs) &&
        Number.isFinite(f.lat) &&
        Number.isFinite(f.lon) &&
        (f.hacc === undefined || f.hacc <= opt.maxAccuracyM)
    )
    .sort((a, b) => a.tMs - b.tMs);
  if (fixes.length < 2) return [];

  const placed = fixes.map((f) => {
    const xy = project(f);
    return {
      ...place(xy, line, cumulative),
      xy,
      tMs: f.tMs,
      lat: f.lat,
      lon: f.lon,
    };
  });

  type Placed = (typeof placed)[number];

  /** Follows the line from `first`; the pass ends at the end-line crossing. */
  const walk = (
    first: number,
    hasPre: boolean
  ): { endMs: number; endIdx: number } | null => {
    const start = placed[first] as Placed;
    let maxS = Math.max(0, start.s);
    if (start.d > opt.toleranceM && start.s < length) return null;
    for (let j = hasPre ? first : first + 1; j < placed.length; j++) {
      const before = placed[j - 1] as Placed;
      const cur = placed[j] as Placed;
      const dt = (cur.tMs - before.tMs) / 1000;
      const dist = haversineMeters(before, cur);
      if (dt <= 0 || dt > opt.maxGapSeconds || dist > opt.maxGapM) return null;
      if (dist / dt > opt.maxSpeedMps) return null;
      if (cur.s >= length) {
        if (cur.s === before.s) return null;
        const f = (length - before.s) / (cur.s - before.s);
        const l0 = lateralOffset(before.xy, tail.a, tail.b);
        const l1 = lateralOffset(cur.xy, tail.a, tail.b);
        if (Math.abs(l0 + f * (l1 - l0)) > opt.toleranceM) return null;
        return {
          endMs: before.tMs + f * (cur.tMs - before.tMs),
          endIdx: j,
        };
      }
      if (cur.d > opt.toleranceM) return null;
      if (cur.s < maxS - opt.backslideM) return null;
      maxS = Math.max(maxS, cur.s);
    }
    return null;
  };

  const passes: SegmentPass[] = [];
  let i = 1;
  while (i < placed.length) {
    const prev = placed[i - 1] as Placed;
    const next = placed[i] as Placed;

    let startMs: number | null = null;
    let first = i;
    let hasPre = true;
    const crossing = crossStart(prev, next, head);
    if (crossing && crossing.lateralM <= opt.toleranceM) {
      startMs = crossing.tMs;
    } else if (
      i === 1 &&
      prev.s >= 0 &&
      prev.s <= opt.toleranceM &&
      prev.d <= opt.toleranceM &&
      next.s > prev.s &&
      next.tMs > prev.tMs
    ) {
      // The recording began on the segment, just past its start.
      const speed = (next.s - prev.s) / ((next.tMs - prev.tMs) / 1000);
      if (speed > 0) {
        startMs = prev.tMs - (prev.s / speed) * 1000;
        first = 0;
        hasPre = false;
      }
    }
    if (startMs === null) {
      i++;
      continue;
    }

    const walked = walk(first, hasPre);
    if (walked) {
      const elapsedSeconds = (walked.endMs - startMs) / 1000;
      if (elapsedSeconds > 0 && length / elapsedSeconds <= opt.maxSpeedMps) {
        passes.push({
          startMs,
          endMs: walked.endMs,
          elapsedSeconds,
          avgSpeedMps: length / elapsedSeconds,
          fixCount: walked.endIdx - first + 1,
        });
        i = walked.endIdx + 1;
        continue;
      }
    }
    i++;
  }
  return passes;
}

/** The fastest valid pass, or null. */
export function bestSegmentPass(
  segment: SegmentGeometry,
  track: readonly TrackFix[],
  options?: SegmentMatchOptions
): SegmentPass | null {
  let best: SegmentPass | null = null;
  for (const pass of findSegmentPasses(segment, track, options)) {
    if (!best || pass.elapsedSeconds < best.elapsedSeconds) best = pass;
  }
  return best;
}

/** True when a track's box comes within `marginM` of the segment's box. */
export function trackMayCrossSegment(
  segmentBounds: RouteBounds,
  trackBounds: RouteBounds,
  marginM = 60
): boolean {
  const latMargin = marginM / 111_320;
  const midLat = (segmentBounds.minLat + segmentBounds.maxLat) / 2;
  const lonMargin =
    marginM / (111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));
  return !(
    trackBounds.maxLat < segmentBounds.minLat - latMargin ||
    trackBounds.minLat > segmentBounds.maxLat + latMargin ||
    trackBounds.maxLon < segmentBounds.minLon - lonMargin ||
    trackBounds.minLon > segmentBounds.maxLon + lonMargin
  );
}

/** The point `distanceM` along the line (clamped to its ends). */
export function pointAtDistance(
  points: readonly RoutePoint[],
  distanceM: number
): RoutePoint | null {
  const first = points[0];
  if (!first) return null;
  if (distanceM <= 0) return first;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as RoutePoint;
    const b = points[i] as RoutePoint;
    const step = haversineMeters(a, b);
    if (walked + step >= distanceM) {
      const t = step === 0 ? 0 : (distanceM - walked) / step;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        ...(a.alt !== undefined && b.alt !== undefined
          ? { alt: a.alt + (b.alt - a.alt) * t }
          : {}),
      };
    }
    walked += step;
  }
  return points[points.length - 1] as RoutePoint;
}

/**
 * The stretch of `points` between `fromM` and `toM` metres from its start,
 * with interpolated end points so the cut is exact. Null when the range is
 * empty or reversed.
 */
export function sliceRouteByDistance(
  points: readonly RoutePoint[],
  fromM: number,
  toM: number
): RoutePoint[] | null {
  if (points.length < 2 || !(toM > fromM)) return null;
  const total = routeDistanceMeters(points);
  const from = Math.max(0, fromM);
  const to = Math.min(total, toM);
  if (!(to > from)) return null;
  const out: RoutePoint[] = [];
  const startPoint = pointAtDistance(points, from);
  if (startPoint) out.push(startPoint);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    walked += haversineMeters(
      points[i - 1] as RoutePoint,
      points[i] as RoutePoint
    );
    if (walked > from && walked < to) out.push(points[i] as RoutePoint);
  }
  const endPoint = pointAtDistance(points, to);
  if (endPoint) out.push(endPoint);
  return out.length >= 2 ? out : null;
}

export interface PreparedSegment {
  points: RoutePoint[];
  lengthM: number;
  bounds: RouteBounds;
}

/**
 * The stored form of a segment: thinned to `SEGMENT_MAX_POINTS`, length
 * measured on the full line. Null when it is outside the allowed length.
 */
export function prepareSegment(
  points: readonly RoutePoint[]
): PreparedSegment | null {
  if (points.length < 2) return null;
  const lengthM = routeDistanceMeters(points);
  if (lengthM < SEGMENT_MIN_LENGTH_M || lengthM > SEGMENT_MAX_LENGTH_M) {
    return null;
  }
  const kept = simplifyRoute(points, SEGMENT_MAX_POINTS).points;
  const bounds = routeBounds(kept);
  if (!bounds) return null;
  return {
    points: kept.map((p) => ({ lat: p.lat, lon: p.lon })),
    lengthM,
    bounds,
  };
}

/** Where along `line` (metres) the point nearest `p` lies; used to place a drag handle. */
export function distanceAlongRoute(
  points: readonly RoutePoint[],
  p: LatLon
): number {
  if (points.length < 2) return 0;
  const project = localProjector(points[0] as LatLon);
  const line = points.map(project);
  const target = project(p);
  let best = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Xy;
    const b = line[i] as Xy;
    const pieceLength = Math.hypot(b.x - a.x, b.y - a.y);
    const { distance, t } = distanceToSegment(target, a, b);
    if (distance < best) {
      best = distance;
      bestAlong = walked + t * pieceLength;
    }
    walked += pieceLength;
  }
  return bestAlong;
}

/**
 * Whether `elapsedSeconds` beats every time in `others` (strictly). False with
 * nothing to compare against, so a first effort is never called a record.
 */
export function isSegmentPersonalBest(
  elapsedSeconds: number,
  others: readonly number[]
): boolean {
  const valid = others.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return false;
  return elapsedSeconds < Math.min(...valid);
}

/** One stored effort, as the annotation below reads it. */
export interface EffortForAnnotation {
  startedAtMs: number;
  elapsedSeconds: number;
}

export interface EffortAnnotation {
  /** The fastest effort so far (the earliest of equal times). */
  isBest: boolean;
  /** Beats every earlier effort; the first effort is never one. */
  isPersonalRecord: boolean;
}

/** Marks the best effort and each effort that set a new record, in the input's order. */
export function annotateEfforts(
  efforts: readonly EffortForAnnotation[]
): EffortAnnotation[] {
  const order = efforts
    .map((effort, index) => ({ effort, index }))
    .sort(
      (a, b) => a.effort.startedAtMs - b.effort.startedAtMs || a.index - b.index
    );
  const out: EffortAnnotation[] = efforts.map(() => ({
    isBest: false,
    isPersonalRecord: false,
  }));
  let best = Infinity;
  let bestIndex = -1;
  for (const { effort, index } of order) {
    if (best !== Infinity && effort.elapsedSeconds < best) {
      (out[index] as EffortAnnotation).isPersonalRecord = true;
    }
    if (effort.elapsedSeconds < best) {
      best = effort.elapsedSeconds;
      bestIndex = index;
    }
  }
  if (bestIndex >= 0) (out[bestIndex] as EffortAnnotation).isBest = true;
  return out;
}
