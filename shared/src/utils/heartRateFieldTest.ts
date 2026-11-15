import {
  HR_ZONE_COUNT,
  MAX_CUSTOM_FLOOR_BPM,
  MAX_MAX_HR,
  MIN_CUSTOM_FLOOR_BPM,
  MIN_MAX_HR,
  customFloorsProblem,
  type HrSample,
} from './heartRateZones.ts';
import {
  THIRTY_MINUTE_SECONDS,
  THIRTY_MINUTE_SPLIT_SECONDS,
} from './fitnessTest.ts';

/**
 * Running heart-rate zones from a field test, instead of from an age formula.
 *
 * Two numbers come out of a hard, measured run:
 *
 * - Threshold heart rate (lactate threshold heart rate, LTHR): the average
 *   heart rate of the last 20 minutes of the 30-minute all-out run (Friel).
 *   It is the same run, and the same last 20 minutes, the 30-minute fitness
 *   test already uses for threshold pace. Zones built on it follow the person's
 *   fitness rather than their age.
 * - Peak heart rate: the highest sustained reading in any all-out test
 *   (5K, Cooper, 30-minute). It is a floor for max heart rate: the true max is
 *   at least this high. Suggest it when it beats the max in use.
 *
 * The resulting zones are stored as the existing `custom` method, so nothing
 * else (storage, time in zone, training load, run targets) has to change.
 */

/**
 * Zone floors as a fraction of threshold heart rate: Friel's running zones
 * (zone 2 from 85%, zone 3 from 90%, zone 4 from 95%, zone 5 from 100%, his
 * 5a to 5c together). Friel leaves zone 1 open below 85%; Sparky needs a real
 * floor because readings under zone 1 count as rest, so zone 1 starts at 70%,
 * which keeps standing and walking out of zone 1.
 */
export const THRESHOLD_HR_ZONE_FRACTIONS = [0.7, 0.85, 0.9, 0.95, 1] as const;

/** Threshold heart rates outside this range are not a believable test. */
export const MIN_THRESHOLD_HR = 100;
export const MAX_THRESHOLD_HR = 220;

/**
 * Peak heart rate is the highest reading held for this many seconds (the
 * lowest reading in the window), so a single optical spike or strap glitch
 * cannot set a max heart rate.
 */
export const PEAK_HR_WINDOW_SECONDS = 5;

/**
 * The last 20 minutes need readings for at least this share of their time,
 * else the average is not trusted (a strap that dropped out for half the run).
 */
export const MIN_THRESHOLD_COVERAGE = 0.8;

/** Gaps longer than this are a dropout, not a reading that held. */
const MAX_HOLD_SECONDS = 60;

interface TimedBpm {
  ms: number;
  bpm: number;
}

function orderedSamples(samples: readonly HrSample[]): TimedBpm[] {
  if (!Array.isArray(samples)) return [];
  return samples
    .filter(
      (s) =>
        typeof s?.t === 'string' &&
        typeof s.bpm === 'number' &&
        Number.isFinite(s.bpm) &&
        s.bpm > 0
    )
    .map((s) => ({ ms: Date.parse(s.t), bpm: s.bpm }))
    .filter((s) => Number.isFinite(s.ms))
    .sort((a, b) => a.ms - b.ms);
}

/**
 * Time-weighted average bpm between two instants (ms), and how many seconds of
 * that window readings covered. Each reading holds until the next one, capped
 * at a minute so a dropout is not filled in.
 */
function averageBetween(
  ordered: readonly TimedBpm[],
  startMs: number,
  endMs: number
): { average: number; coveredSeconds: number } | null {
  let weighted = 0;
  let covered = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    if (!current) continue;
    const next = ordered[i + 1];
    const holdEnd = Math.min(
      next ? next.ms : current.ms,
      current.ms + MAX_HOLD_SECONDS * 1000
    );
    const from = Math.max(current.ms, startMs);
    const to = Math.min(holdEnd, endMs);
    if (to <= from) continue;
    const seconds = (to - from) / 1000;
    weighted += current.bpm * seconds;
    covered += seconds;
  }
  if (covered <= 0) return null;
  return { average: weighted / covered, coveredSeconds: covered };
}

/**
 * Threshold heart rate from the 30-minute all-out run: the time-weighted
 * average of the last 20 minutes (from 10 to 30 minutes after `startedAt`).
 * Null when readings cover too little of those 20 minutes or the result is
 * not a believable threshold.
 */
export function thresholdHeartRateFromThirtyMinuteRun(
  samples: readonly HrSample[],
  startedAt: string
): number | null {
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return null;
  const windowStart = startMs + THIRTY_MINUTE_SPLIT_SECONDS * 1000;
  const windowEnd = startMs + THIRTY_MINUTE_SECONDS * 1000;
  const result = averageBetween(
    orderedSamples(samples),
    windowStart,
    windowEnd
  );
  if (!result) return null;
  const windowSeconds = (windowEnd - windowStart) / 1000;
  if (result.coveredSeconds < windowSeconds * MIN_THRESHOLD_COVERAGE) {
    return null;
  }
  const threshold = Math.round(result.average);
  return isBelievableThresholdHr(threshold) ? threshold : null;
}

export function isBelievableThresholdHr(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_THRESHOLD_HR &&
    value <= MAX_THRESHOLD_HR
  );
}

/**
 * The highest heart rate held for {@link PEAK_HR_WINDOW_SECONDS} in a hard
 * test, rounded. Null when there are too few readings or the peak is outside
 * the max heart rate range Sparky accepts.
 */
export function peakHeartRateFromTest(
  samples: readonly HrSample[]
): number | null {
  const ordered = orderedSamples(samples);
  if (ordered.length < 2) return null;
  let best = 0;
  for (const sample of ordered) {
    const windowEnd = sample.ms + PEAK_HR_WINDOW_SECONDS * 1000;
    const coverage = averageBetween(ordered, sample.ms, windowEnd);
    if (!coverage || coverage.coveredSeconds < PEAK_HR_WINDOW_SECONDS) continue;
    // Held: the lowest reading in the window, so one spike sets nothing.
    let held = sample.bpm;
    for (const other of ordered) {
      if (other.ms > sample.ms && other.ms < windowEnd && other.bpm < held) {
        held = other.bpm;
      }
    }
    if (held > best) best = held;
  }
  const peak = Math.round(best);
  return peak >= MIN_MAX_HR && peak <= MAX_MAX_HR ? peak : null;
}

/**
 * Five ascending custom-zone floors from a threshold heart rate, ready to
 * save as the `custom` method. Null for a threshold outside
 * {@link MIN_THRESHOLD_HR} to {@link MAX_THRESHOLD_HR}.
 */
export function thresholdHeartRateFloors(thresholdHr: number): number[] | null {
  if (!isBelievableThresholdHr(thresholdHr)) return null;
  const floors = THRESHOLD_HR_ZONE_FRACTIONS.map((fraction) =>
    Math.min(
      MAX_CUSTOM_FLOOR_BPM,
      Math.max(MIN_CUSTOM_FLOOR_BPM, Math.round(thresholdHr * fraction))
    )
  );
  if (floors.length !== HR_ZONE_COUNT) return null;
  return customFloorsProblem(floors) === null ? floors : null;
}

/** What a test says about a person's heart-rate zones. */
export interface HeartRateFieldTestResult {
  /** Threshold heart rate; only the 30-minute run gives one. */
  thresholdHr: number | null;
  /** Custom floors from the threshold heart rate, or null without one. */
  floors: number[] | null;
  /** Highest heart rate held for five seconds. */
  peakHr: number | null;
  /**
   * The peak, when it beats the max heart rate in use: the person reached a
   * higher heart rate than their max, so their max is too low. Null otherwise.
   */
  suggestedMaxHr: number | null;
}

/**
 * Everything a test's heart-rate readings give. `currentMaxHr` is the max
 * heart rate in use now (from `resolveHeartRateZones`), to decide whether the
 * peak should be offered as a new max.
 */
export function evaluateHeartRateFieldTest(input: {
  testType: '5k' | '30min' | 'cooper';
  samples: readonly HrSample[];
  /** When the timed effort began, ISO 8601. */
  startedAt: string;
  currentMaxHr?: number | null;
}): HeartRateFieldTestResult {
  const thresholdHr =
    input.testType === '30min'
      ? thresholdHeartRateFromThirtyMinuteRun(input.samples, input.startedAt)
      : null;
  const peakHr = peakHeartRateFromTest(input.samples);
  const suggestedMaxHr =
    peakHr !== null &&
    (typeof input.currentMaxHr !== 'number' || peakHr > input.currentMaxHr)
      ? peakHr
      : null;
  return {
    thresholdHr,
    floors: thresholdHr === null ? null : thresholdHeartRateFloors(thresholdHr),
    peakHr,
    suggestedMaxHr,
  };
}
