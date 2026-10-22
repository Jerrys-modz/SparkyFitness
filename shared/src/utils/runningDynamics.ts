import type { GpsTrackPoint } from '../schemas/database/ExerciseEntryGpsPoints.zod.ts';

/**
 * Running dynamics a watch or sensor measures per stride: ground contact time,
 * vertical oscillation, step length and running power. Nothing here estimates
 * a value the device did not report; a metric the track does not carry comes
 * back null.
 */

/** Readings outside these bounds are sensor glitches, not gait, and are ignored. */
const GROUND_CONTACT_MS = { min: 80, max: 700 };
const VERTICAL_OSCILLATION_MM = { min: 10, max: 250 };
const STRIDE_CM = { min: 30, max: 350 };
const POWER_WATTS = { min: 1, max: 1500 };

/** Fewest valid readings a metric needs before an average is given. */
const MIN_READINGS = 3;

export type RunningDynamicsKey =
  | 'groundContactTimeMs'
  | 'verticalOscillationMm'
  | 'strideLengthCm'
  | 'powerWatts';

/** The measured metrics plus the ratio derived from two of them. */
export type RunningDynamicsSeriesKey =
  RunningDynamicsKey | 'verticalRatioPercent';

type Bounds = { min: number; max: number };

const BOUNDS: Record<RunningDynamicsKey, Bounds> = {
  groundContactTimeMs: GROUND_CONTACT_MS,
  verticalOscillationMm: VERTICAL_OSCILLATION_MM,
  strideLengthCm: STRIDE_CM,
  powerWatts: POWER_WATTS,
};

const FIELD: Record<RunningDynamicsKey, 'gct' | 'vo' | 'stride' | 'power'> = {
  groundContactTimeMs: 'gct',
  verticalOscillationMm: 'vo',
  strideLengthCm: 'stride',
  powerWatts: 'power',
};

type DynamicsPoint = Pick<
  GpsTrackPoint,
  't' | 'gct' | 'vo' | 'stride' | 'power'
>;

const valid = (value: unknown, bounds: Bounds): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= bounds.min &&
  value <= bounds.max;

/**
 * Vertical ratio in percent: vertical oscillation as a share of step length,
 * the definition Garmin uses (lower means less of each step goes up rather
 * than forward). Null unless both inputs are plausible readings.
 */
export function verticalRatioPercent(
  verticalOscillationMm: number | null | undefined,
  strideLengthCm: number | null | undefined
): number | null {
  if (!valid(verticalOscillationMm, VERTICAL_OSCILLATION_MM)) return null;
  if (!valid(strideLengthCm, STRIDE_CM)) return null;
  // mm over cm: divide the stride by ten to get mm, then to a percentage.
  const ratio = (verticalOscillationMm / (strideLengthCm * 10)) * 100;
  return Math.round(ratio * 10) / 10;
}

export interface RunningDynamicsSummary {
  /** Milliseconds. */
  groundContactTimeMs: number | null;
  /** Millimetres. */
  verticalOscillationMm: number | null;
  /** Centimetres per step. */
  strideLengthCm: number | null;
  /** Watts. */
  powerWatts: number | null;
  /** Percent; derived from the two averages above, never measured. */
  verticalRatioPercent: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Per-run averages of what the track's points carry; null for what they lack. */
export function summarizeRunningDynamics(
  points: readonly DynamicsPoint[]
): RunningDynamicsSummary {
  const average = (key: RunningDynamicsKey): number | null => {
    const field = FIELD[key];
    let sum = 0;
    let count = 0;
    for (const point of points) {
      const value = point[field];
      if (valid(value, BOUNDS[key])) {
        sum += value;
        count++;
      }
    }
    return count >= MIN_READINGS ? round1(sum / count) : null;
  };
  const verticalOscillationMm = average('verticalOscillationMm');
  const strideLengthCm = average('strideLengthCm');
  return {
    groundContactTimeMs: average('groundContactTimeMs'),
    verticalOscillationMm,
    strideLengthCm,
    powerWatts: average('powerWatts'),
    verticalRatioPercent: verticalRatioPercent(
      verticalOscillationMm,
      strideLengthCm
    ),
  };
}

export interface RunningDynamicsReading {
  /** Minutes since the first reading of this metric. */
  elapsedMinutes: number;
  value: number;
}

/**
 * One metric along the run in time order, readings outside the plausible range
 * dropped. The vertical ratio is read per point, from the points that carry
 * both vertical oscillation and step length. Empty (so the caller hides the
 * chart) under three readings.
 */
export function runningDynamicsSeries(
  points: readonly DynamicsPoint[],
  key: RunningDynamicsSeriesKey
): RunningDynamicsReading[] {
  const readings: { timestamp: number; value: number }[] = [];
  for (const point of points) {
    const value =
      key === 'verticalRatioPercent'
        ? verticalRatioPercent(point.vo, point.stride)
        : point[FIELD[key]];
    if (key === 'verticalRatioPercent') {
      if (value == null) continue;
    } else if (!valid(value, BOUNDS[key])) {
      continue;
    }
    const timestamp = Date.parse(point.t);
    if (!Number.isFinite(timestamp)) continue;
    readings.push({ timestamp, value: value as number });
  }
  if (readings.length < MIN_READINGS) return [];
  readings.sort((a, b) => a.timestamp - b.timestamp);
  const start = readings[0]?.timestamp ?? 0;
  return readings.map((reading) => ({
    elapsedMinutes: (reading.timestamp - start) / 60_000,
    value: reading.value,
  }));
}
