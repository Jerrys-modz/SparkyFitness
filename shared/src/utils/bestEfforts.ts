import type { GpsTrackPoint } from '../schemas/database/ExerciseEntryGpsPoints.zod.ts';
import { haversineMeters } from './routeGeometry.ts';
import { RACE_DISTANCE_METERS } from './raceTimePredictions.ts';

/**
 * Best efforts: the fastest contiguous stretch of a given length found inside
 * a recorded run ("fastest 1 km of this run"), however long the run was. Pure
 * and timezone-free, so the server's all-time board and the apps' per-run
 * highlight read the same figures.
 */

export const BEST_EFFORT_IDS = [
  '1k',
  '1mi',
  '5k',
  '10k',
  'half_marathon',
] as const;
export type BestEffortId = (typeof BEST_EFFORT_IDS)[number];

export const BEST_EFFORT_METERS: Record<BestEffortId, number> = {
  '1k': RACE_DISTANCE_METERS['1k'],
  '1mi': RACE_DISTANCE_METERS['1mi'],
  '5k': RACE_DISTANCE_METERS['5k'],
  '10k': RACE_DISTANCE_METERS['10k'],
  half_marathon: RACE_DISTANCE_METERS.half_marathon,
};

/** Cumulative distance reached at a moment: `seconds` on any clock that only moves forward. */
export interface EffortSample {
  seconds: number;
  meters: number;
}

export interface BestEffortOptions {
  /**
   * A stretch between two samples longer than this is a pause or a signal
   * loss, so no effort may span it: the clock ran but the distance is unknown.
   */
  maxGapSeconds: number;
  /** A leg faster than this is a GPS jump, not running; no effort may span it. */
  maxSpeedMps: number;
}

/** Defaults for a GPS track (a point every second or few). */
export const GPS_EFFORT_OPTIONS: BestEffortOptions = {
  maxGapSeconds: 30,
  maxSpeedMps: 12,
};

/** Defaults for a distance series on active time, which is sampled more coarsely. */
export const DISTANCE_SERIES_EFFORT_OPTIONS: BestEffortOptions = {
  maxGapSeconds: 60,
  maxSpeedMps: 12,
};

export interface BestEffort {
  id: BestEffortId;
  distanceMeters: number;
  seconds: number;
  /** Where the stretch starts and ends along the run, in metres from its first sample. */
  startMeters: number;
  endMeters: number;
  /** The same two moments on the samples' own clock, from the run's first sample. */
  startSeconds: number;
  endSeconds: number;
}

const EPSILON = 1e-6;

/** Drops unusable samples, orders them by time, and keeps distance from running backwards. */
function sanitize(samples: readonly EffortSample[]): EffortSample[] {
  const valid = samples.filter(
    (s) => Number.isFinite(s.seconds) && Number.isFinite(s.meters)
  );
  const ordered = [...valid].sort((a, b) => a.seconds - b.seconds);
  const out: EffortSample[] = [];
  for (const sample of ordered) {
    const last = out[out.length - 1];
    // A repeated timestamp adds nothing; the first reading stands.
    if (last && sample.seconds <= last.seconds) continue;
    out.push({
      seconds: sample.seconds,
      meters: last ? Math.max(last.meters, sample.meters) : sample.meters,
    });
  }
  return out;
}

/** Stretches of samples with no pause, signal loss or jump between them. */
function continuousSegments(
  samples: readonly EffortSample[],
  options: BestEffortOptions
): EffortSample[][] {
  const segments: EffortSample[][] = [];
  let current: EffortSample[] = [];
  samples.forEach((sample, index) => {
    const previous = samples[index - 1];
    if (previous) {
      const dt = sample.seconds - previous.seconds;
      const dm = sample.meters - previous.meters;
      if (dt > options.maxGapSeconds || dm / dt > options.maxSpeedMps) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    current.push(sample);
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Seconds at which a segment has covered `meters`, as early as it first did. */
function secondsFirstReaching(
  segment: readonly EffortSample[],
  meters: number
): number {
  let lo = 0;
  let hi = segment.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((segment[mid] as EffortSample).meters >= meters - EPSILON) hi = mid;
    else lo = mid + 1;
  }
  const hit = segment[lo] as EffortSample;
  const before = segment[lo - 1];
  if (!before || hit.meters - before.meters <= EPSILON) return hit.seconds;
  const ratio = (meters - before.meters) / (hit.meters - before.meters);
  return before.seconds + ratio * (hit.seconds - before.seconds);
}

/** Seconds at which a segment was last at `meters`, as late as it stayed there. */
function secondsLastAt(
  segment: readonly EffortSample[],
  meters: number
): number {
  let lo = 0;
  let hi = segment.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((segment[mid] as EffortSample).meters <= meters + EPSILON) lo = mid;
    else hi = mid - 1;
  }
  const at = segment[lo] as EffortSample;
  const after = segment[lo + 1];
  if (!after || after.meters - at.meters <= EPSILON) return at.seconds;
  const ratio = (meters - at.meters) / (after.meters - at.meters);
  return at.seconds + ratio * (after.seconds - at.seconds);
}

/**
 * The fastest stretch of `targetMeters` in the samples, or null when the run
 * is shorter than that. The time to cover a stretch is piecewise linear in
 * where it starts, so its minimum sits where the start or the end falls on a
 * sample; checking both ends of every sample is exact, not an approximation.
 * A stretch never spans a pause, signal loss or GPS jump.
 */
export function fastestEffort(
  samples: readonly EffortSample[],
  targetMeters: number,
  options: BestEffortOptions = GPS_EFFORT_OPTIONS
): Omit<BestEffort, 'id'> | null {
  if (!(targetMeters > 0)) return null;
  const clean = sanitize(samples);
  if (clean.length < 2) return null;
  const origin = clean[0] as EffortSample;

  let best = null as Omit<BestEffort, 'id'> | null;
  const consider = (
    startMeters: number,
    startSeconds: number,
    endMeters: number,
    endSeconds: number
  ) => {
    const seconds = endSeconds - startSeconds;
    if (!(seconds > 0)) return;
    if (best && seconds >= best.seconds) return;
    best = {
      distanceMeters: targetMeters,
      seconds,
      startMeters: startMeters - origin.meters,
      endMeters: endMeters - origin.meters,
      startSeconds: startSeconds - origin.seconds,
      endSeconds: endSeconds - origin.seconds,
    };
  };

  for (const segment of continuousSegments(clean, options)) {
    const first = segment[0] as EffortSample;
    const last = segment[segment.length - 1] as EffortSample;
    if (last.meters - first.meters < targetMeters - EPSILON) continue;
    for (const sample of segment) {
      const startMeters = sample.meters - targetMeters;
      if (startMeters >= first.meters - EPSILON) {
        consider(
          startMeters,
          secondsLastAt(segment, startMeters),
          sample.meters,
          sample.seconds
        );
      }
      const endMeters = sample.meters + targetMeters;
      if (endMeters <= last.meters + EPSILON) {
        consider(
          sample.meters,
          sample.seconds,
          endMeters,
          secondsFirstReaching(segment, endMeters)
        );
      }
    }
  }
  return best;
}

/** The fastest stretch of each requested distance the run is long enough for. */
export function bestEffortsFromSamples(
  samples: readonly EffortSample[],
  options: BestEffortOptions = GPS_EFFORT_OPTIONS,
  ids: readonly BestEffortId[] = BEST_EFFORT_IDS
): BestEffort[] {
  const efforts: BestEffort[] = [];
  for (const id of ids) {
    const effort = fastestEffort(samples, BEST_EFFORT_METERS[id], options);
    if (effort) efforts.push({ id, ...effort });
  }
  return efforts;
}

/**
 * Samples from stored GPS trackpoints: ISO instants and the path length by
 * great-circle legs. Points with no usable time or position are skipped.
 */
export function effortSamplesFromGpsTrack(
  points: readonly Pick<GpsTrackPoint, 't' | 'lat' | 'lon'>[]
): EffortSample[] {
  const timed = points
    .map((p) => ({ ms: Date.parse(p.t), lat: p.lat, lon: p.lon }))
    .filter(
      (p) =>
        Number.isFinite(p.ms) &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon)
    )
    .sort((a, b) => a.ms - b.ms);
  const samples: EffortSample[] = [];
  let meters = 0;
  let previous: (typeof timed)[number] | null = null;
  for (const p of timed) {
    // Repeated timestamps are one reading; keep the first.
    if (previous && p.ms === previous.ms) continue;
    if (previous) meters += haversineMeters(previous, p);
    samples.push({ seconds: p.ms / 1000, meters });
    previous = p;
  }
  return samples;
}

/** Samples from a stored distance series of `[active seconds, cumulative metres]` rows. */
export function effortSamplesFromDistanceSeries(
  rows: readonly (readonly [number, number])[]
): EffortSample[] {
  return rows.map(([seconds, meters]) => ({ seconds, meters }));
}

/** The better of two efforts at the same distance: the shorter time wins, the earlier keeps a tie. */
export function fasterEffort<T extends { seconds: number }>(
  current: T | undefined,
  candidate: T
): T {
  return current && current.seconds <= candidate.seconds ? current : candidate;
}
