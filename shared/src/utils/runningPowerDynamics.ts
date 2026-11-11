/**
 * Running power and running dynamics, worked out from the per-trackpoint
 * series a workout stores (`power`, `gct`, `vo`, `stride`, `hr`).
 *
 * Units follow the stored trackpoint: power in watts, ground contact time in
 * milliseconds, vertical oscillation in millimetres, stride length in
 * centimetres. Every function is pure and tolerates missing readings.
 */

/** The fields of a stored trackpoint these helpers read. */
export interface RunSensorPoint {
  /** ISO 8601 instant. */
  t: string;
  power?: number | null;
  gct?: number | null;
  vo?: number | null;
  stride?: number | null;
  hr?: number | null;
}

/** A reading held until the next one, but never across a gap longer than this. */
export const MAX_HOLD_SECONDS = 30;
/** Rolling window the normalized power average runs over. */
export const NORMALIZED_POWER_WINDOW_SECONDS = 30;
/** The effort a critical power estimate is taken from. */
export const CRITICAL_POWER_WINDOW_SECONDS = 20 * 60;
/** Share of the best 20 minute power counted as critical power. */
export const CRITICAL_POWER_FRACTION = 0.95;

/** Power zone floors as a fraction of critical power; zone 1 starts at 0. */
export const RUNNING_POWER_ZONE_FLOORS = [0, 0.8, 0.9, 1.0, 1.15] as const;
export const RUNNING_POWER_ZONE_COUNT = RUNNING_POWER_ZONE_FLOORS.length;

export const MIN_CRITICAL_POWER_WATTS = 50;
export const MAX_CRITICAL_POWER_WATTS = 600;

type Field = 'power' | 'gct' | 'vo' | 'stride' | 'hr';

interface Timed {
  /** Seconds from an arbitrary origin. */
  at: number;
  value: number;
  /** Seconds this reading is held for. */
  weight: number;
}

/** Positive finite readings of one field, each with the time it covers. */
function timedSeries(points: readonly RunSensorPoint[], field: Field): Timed[] {
  const all = points
    .map((point) => ({ at: Date.parse(point.t) / 1000, raw: point[field] }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at);
  const out: Timed[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const { at, raw } = all[i]!;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
    const next = all[i + 1];
    const gap = next ? next.at - at : 1;
    out.push({
      at,
      value: raw,
      weight: Math.min(Math.max(gap, 0), MAX_HOLD_SECONDS),
    });
  }
  return out;
}

function weightedMean(series: readonly Timed[]): number | null {
  let total = 0;
  let seconds = 0;
  for (const s of series) {
    total += s.value * s.weight;
    seconds += s.weight;
  }
  return seconds > 0 ? total / seconds : null;
}

/** The series as one value per second, each reading held for its weight. */
function perSecond(series: readonly Timed[]): number[] {
  const out: number[] = [];
  for (const s of series) {
    for (let i = 0; i < Math.round(s.weight); i += 1) out.push(s.value);
  }
  return out;
}

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Normalized power: a 30 second rolling average, each value raised to the
 * fourth power, averaged, and rooted. It weights surges more than a plain
 * mean, so a hilly or interval run scores above its average power.
 * Null with under 30 seconds of power.
 */
export function normalizedPower(
  points: readonly RunSensorPoint[]
): number | null {
  const seconds = perSecond(timedSeries(points, 'power'));
  const window = NORMALIZED_POWER_WINDOW_SECONDS;
  if (seconds.length < window) return null;
  let sum = seconds.slice(0, window).reduce((a, b) => a + b, 0);
  let fourth = 0;
  let count = 0;
  for (let i = window; i <= seconds.length; i += 1) {
    fourth += (sum / window) ** 4;
    count += 1;
    if (i < seconds.length) sum += seconds[i]! - seconds[i - window]!;
  }
  return count > 0 ? (fourth / count) ** 0.25 : null;
}

/**
 * Best average power over any stretch of the given length, or null when the
 * run's power does not cover that long.
 */
export function bestAveragePower(
  points: readonly RunSensorPoint[],
  windowSeconds: number
): number | null {
  const seconds = perSecond(timedSeries(points, 'power'));
  if (seconds.length < windowSeconds) return null;
  let sum = seconds.slice(0, windowSeconds).reduce((a, b) => a + b, 0);
  let best = sum;
  for (let i = windowSeconds; i < seconds.length; i += 1) {
    sum += seconds[i]! - seconds[i - windowSeconds]!;
    if (sum > best) best = sum;
  }
  return best / windowSeconds;
}

/**
 * A critical power estimate from one run: 95% of its best 20 minutes, the
 * usual threshold test rule. It is only as good as the effort in that run, so
 * callers show it as an estimate and let the person type their own.
 */
export function estimateCriticalPower(
  points: readonly RunSensorPoint[]
): number | null {
  const best = bestAveragePower(points, CRITICAL_POWER_WINDOW_SECONDS);
  if (best === null) return null;
  const cp = best * CRITICAL_POWER_FRACTION;
  return cp >= MIN_CRITICAL_POWER_WATTS && cp <= MAX_CRITICAL_POWER_WATTS
    ? round(cp, 0)
    : null;
}

/** Zone 1 to 5 (as index 0 to 4) a power reading falls in for a critical power. */
export function runningPowerZoneIndex(
  watts: number,
  criticalPower: number
): number {
  const fraction = watts / criticalPower;
  let zone = 0;
  RUNNING_POWER_ZONE_FLOORS.forEach((floor, index) => {
    if (fraction >= floor) zone = index;
  });
  return zone;
}

/** Floors in watts for a critical power. */
export function runningPowerZoneFloors(criticalPower: number): number[] {
  return RUNNING_POWER_ZONE_FLOORS.map((fraction) =>
    round(fraction * criticalPower, 0)
  );
}

/** Seconds spent in each of the five power zones. */
export function computeTimeInPowerZones(
  points: readonly RunSensorPoint[],
  criticalPower: number
): number[] {
  const seconds = new Array<number>(RUNNING_POWER_ZONE_COUNT).fill(0);
  if (!(criticalPower > 0)) return seconds;
  for (const s of timedSeries(points, 'power')) {
    const zone = runningPowerZoneIndex(s.value, criticalPower);
    seconds[zone] = (seconds[zone] ?? 0) + s.weight;
  }
  return seconds.map((value) => Math.round(value));
}

export interface RunningPowerSummary {
  averageWatts: number;
  maxWatts: number;
  normalizedWatts: number | null;
  /** Normalized over average power: 1.00 is perfectly even, higher is surgier. */
  variabilityIndex: number | null;
  /**
   * How much the power for each heartbeat fell from the first half to the
   * second, as a percent (positive means the heart worked harder for the same
   * power). Null without heart rate in both halves.
   */
  decouplingPercent: number | null;
  /** Seconds of power the figures cover. */
  seconds: number;
}

/** Average of power and heart rate over each half of the run, by time. */
function halves(
  points: readonly RunSensorPoint[]
): { power: number; hr: number }[] | null {
  const power = timedSeries(points, 'power');
  const hr = timedSeries(points, 'hr');
  if (power.length === 0 || hr.length === 0) return null;
  const first = Math.min(power[0]!.at, hr[0]!.at);
  const last = Math.max(power[power.length - 1]!.at, hr[hr.length - 1]!.at);
  const mid = (first + last) / 2;
  const result: { power: number; hr: number }[] = [];
  for (const inHalf of [(s: Timed) => s.at < mid, (s: Timed) => s.at >= mid]) {
    const p = weightedMean(power.filter(inHalf));
    const h = weightedMean(hr.filter(inHalf));
    if (p === null || h === null) return null;
    result.push({ power: p, hr: h });
  }
  return result;
}

/** Null when the run has under a minute of power. */
export function summarizeRunningPower(
  points: readonly RunSensorPoint[]
): RunningPowerSummary | null {
  const power = timedSeries(points, 'power');
  const seconds = power.reduce((sum, s) => sum + s.weight, 0);
  const average = weightedMean(power);
  if (average === null || seconds < 60) return null;
  const np = normalizedPower(points);
  const [a, b] = halves(points) ?? [];
  // Decoupling is only meaningful once each half is long enough to settle.
  const decoupling =
    a && b && seconds >= 20 * 60
      ? (() => {
          const early = a.power / a.hr;
          const late = b.power / b.hr;
          return early > 0 ? ((early - late) / early) * 100 : null;
        })()
      : null;
  return {
    averageWatts: round(average, 0),
    maxWatts: round(Math.max(...power.map((s) => s.value)), 0),
    normalizedWatts: np === null ? null : round(np, 0),
    variabilityIndex: np === null ? null : round(np / average, 2),
    decouplingPercent: decoupling === null ? null : round(decoupling, 1),
    seconds: Math.round(seconds),
  };
}

export interface RunningDynamicsSummary {
  /** Milliseconds the foot is on the ground each step. */
  groundContactMs: number | null;
  /** Millimetres the body bounces each step. */
  verticalOscillationMm: number | null;
  /** Centimetres per step. */
  strideLengthCm: number | null;
  /**
   * Vertical oscillation as a percent of stride length. Lower means less of
   * each step goes up instead of forward; most runners sit between 6 and 10.
   */
  verticalRatioPercent: number | null;
  /**
   * How much ground contact time rose from the first third of the run to the
   * last third, as a percent. A steady climb is a sign of tiring. Null when
   * either end has no readings or the run is under ten minutes.
   */
  groundContactDriftPercent: number | null;
}

/** Plausible human ranges; a reading outside is a sensor glitch and ignored. */
const DYNAMICS_RANGES = {
  gct: [100, 600],
  vo: [10, 200],
  stride: [30, 300],
} as const;

function plausible(
  points: readonly RunSensorPoint[],
  field: 'gct' | 'vo' | 'stride'
): Timed[] {
  const [min, max] = DYNAMICS_RANGES[field];
  return timedSeries(points, field).filter(
    (s) => s.value >= min && s.value <= max
  );
}

/** Null when the run has no dynamics readings at all. */
export function summarizeRunningDynamics(
  points: readonly RunSensorPoint[]
): RunningDynamicsSummary | null {
  const gct = plausible(points, 'gct');
  const vo = plausible(points, 'vo');
  const stride = plausible(points, 'stride');
  const avgGct = weightedMean(gct);
  const avgVo = weightedMean(vo);
  const avgStride = weightedMean(stride);
  if (avgGct === null && avgVo === null && avgStride === null) return null;

  let drift: number | null = null;
  if (gct.length > 1) {
    const start = gct[0]!.at;
    const end = gct[gct.length - 1]!.at;
    if (end - start >= 10 * 60) {
      const third = (end - start) / 3;
      const early = weightedMean(gct.filter((s) => s.at < start + third));
      const late = weightedMean(gct.filter((s) => s.at >= end - third));
      if (early !== null && late !== null && early > 0) {
        drift = ((late - early) / early) * 100;
      }
    }
  }

  return {
    groundContactMs: avgGct === null ? null : round(avgGct, 0),
    verticalOscillationMm: avgVo === null ? null : round(avgVo, 0),
    strideLengthCm: avgStride === null ? null : round(avgStride, 0),
    verticalRatioPercent:
      avgVo !== null && avgStride !== null
        ? round((avgVo / (avgStride * 10)) * 100, 1)
        : null,
    groundContactDriftPercent: drift === null ? null : round(drift, 1),
  };
}

/** One reading per point for a chart, x in minutes from the first point. */
export interface RunSeriesPoint {
  minute: number;
  value: number;
}

export function runSensorSeries(
  points: readonly RunSensorPoint[],
  field: 'power' | 'gct' | 'vo' | 'stride'
): RunSeriesPoint[] {
  const times = points
    .map((p) => Date.parse(p.t))
    .filter((ms) => Number.isFinite(ms));
  if (times.length === 0) return [];
  const origin = Math.min(...times);
  const out: RunSeriesPoint[] = [];
  for (const point of points) {
    const ms = Date.parse(point.t);
    const value = point[field];
    if (!Number.isFinite(ms) || typeof value !== 'number') continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    if (field !== 'power') {
      const [min, max] = DYNAMICS_RANGES[field];
      if (value < min || value > max) continue;
    }
    out.push({ minute: (ms - origin) / 60000, value });
  }
  return out;
}

export type CriticalPowerSource = 'set' | 'estimated';

/**
 * The critical power zones are drawn from: the runner's own value when it is
 * set and in range, else an estimate from the run.
 */
export function resolveCriticalPower(
  setWatts: number | null | undefined,
  points: readonly RunSensorPoint[]
): { watts: number; source: CriticalPowerSource } | null {
  if (
    typeof setWatts === 'number' &&
    Number.isFinite(setWatts) &&
    setWatts >= MIN_CRITICAL_POWER_WATTS &&
    setWatts <= MAX_CRITICAL_POWER_WATTS
  ) {
    return { watts: Math.round(setWatts), source: 'set' };
  }
  const estimate = estimateCriticalPower(points);
  return estimate === null ? null : { watts: estimate, source: 'estimated' };
}
