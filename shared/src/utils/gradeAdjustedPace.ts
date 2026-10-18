/**
 * Grade-adjusted pace (GAP): the flat-ground pace that costs the same energy as
 * the pace actually run on a slope.
 *
 * Model: the metabolic cost of running per unit distance as a function of
 * gradient, from Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. "Energy cost
 * of walking and running at extreme uphill and downhill slopes." J Appl
 * Physiol 93(3):1039-1046, 2002 (doi:10.1152/japplphysiol.01177.2001):
 *
 *   Cr(i) = 155.4 i^5 - 30.4 i^4 - 43.3 i^3 + 46.3 i^2 + 19.5 i + 3.6
 *
 * with `i` the gradient as a fraction (rise over run) and Cr in J per kg per
 * metre. The fit was measured on a treadmill between -45% and +45%; flat
 * running costs 3.6. A pace on a slope is divided by Cr(i) / 3.6 to give its
 * flat equivalent, so uphill gets faster and a steep downhill gets slower.
 *
 * It is an energy-cost model, not a performance predictor: it says nothing
 * about braking on a steep descent, surface, wind or fatigue. The gradient is
 * clamped to +-20% before it is used, and elevation is smoothed over a
 * distance window first because phone and watch altitude is noisy enough that
 * raw point-to-point gradients would swing by tens of percent.
 */

/** Gradients beyond this are clamped; GPS noise, not terrain, makes them. */
export const GAP_MAX_GRADE_PERCENT = 20;

/** Minetti's cost of running on the flat, J per kg per metre. */
const FLAT_RUNNING_COST = 3.6;

/** Altitude is averaged over this much track, centred on each point. */
export const GAP_SMOOTHING_WINDOW_METERS = 50;

/**
 * A gradient is only read over at least this much track; across less, one
 * metre of altitude noise is a double-digit gradient.
 */
export const GAP_MIN_GRADE_SPAN_METERS = 30;

/** Altitude readings less certain than this (metres) are not used. */
export const GAP_MAX_VERTICAL_ACCURACY_METERS = 30;

/** Fewest altitude readings, and share of the track's points, to trust it. */
const MIN_ALTITUDE_SAMPLES = 10;
const MIN_ALTITUDE_SHARE = 0.7;

/** Share of the distance that must have a gradient before an average is given. */
const MIN_GRADED_DISTANCE_SHARE = 0.8;

/** An element the caller has already bounds-checked. */
const nth = (values: readonly number[], index: number): number =>
  values[index] ?? 0;

const clampGrade = (gradePercent: number): number =>
  Math.min(
    GAP_MAX_GRADE_PERCENT,
    Math.max(-GAP_MAX_GRADE_PERCENT, gradePercent),
  );

/** Cost of running a metre at a gradient, J per kg per metre (Minetti 2002). */
export function runningCostPerMeter(gradePercent: number): number {
  const i = clampGrade(gradePercent) / 100;
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    FLAT_RUNNING_COST
  );
}

/**
 * How many times costlier a metre is at this gradient than on the flat: above
 * 1 uphill, below 1 on a moderate downhill. The gradient is clamped to +-20%.
 */
export function gradeAdjustmentFactor(gradePercent: number): number {
  return runningCostPerMeter(gradePercent) / FLAT_RUNNING_COST;
}

/**
 * The flat pace equivalent to `paceSeconds` (seconds per kilometre or mile,
 * either) run at `gradePercent`. Null for a pace that is not a positive
 * number or a gradient that is not finite.
 */
export function gradeAdjustedPace(
  paceSeconds: number,
  gradePercent: number,
): number | null {
  if (!Number.isFinite(paceSeconds) || !(paceSeconds > 0)) return null;
  if (!Number.isFinite(gradePercent)) return null;
  return paceSeconds / gradeAdjustmentFactor(gradePercent);
}

/** One reading of altitude along a track. */
export interface ElevationSample {
  /** Cumulative distance from the start, metres. */
  meters: number;
  /** Metres above sea level (barometric or fused, whichever the source gave). */
  altitude?: number | null;
  /**
   * Vertical accuracy in metres when the source reports it. A negative value
   * is CoreLocation's "no valid altitude".
   */
  verticalAccuracy?: number | null;
}

export interface ElevationProfile {
  /**
   * Gradient in percent (clamped to +-20) between two distances from the
   * start, or null when they are not both inside the track's altitude data or
   * are closer than `GAP_MIN_GRADE_SPAN_METERS`.
   */
  gradePercent(fromMeters: number, toMeters: number): number | null;
}

/**
 * A smoothed altitude profile for grading, or null when the track does not
 * carry enough elevation to say anything: too few readings, too small a share
 * of the points, or an altitude that never changes (a sensor stuck at one
 * value). Callers hide GAP on null rather than showing the plain pace again.
 */
export function buildElevationProfile(
  samples: readonly ElevationSample[],
): ElevationProfile | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample.meters)) continue;
    const altitude = sample.altitude;
    if (typeof altitude !== "number" || !Number.isFinite(altitude)) continue;
    const accuracy = sample.verticalAccuracy;
    if (
      typeof accuracy === "number" &&
      (accuracy < 0 || accuracy > GAP_MAX_VERTICAL_ACCURACY_METERS)
    ) {
      continue;
    }
    // Distance only grows along a track; a reading that steps back is noise.
    if (xs.length > 0 && sample.meters < nth(xs, xs.length - 1)) continue;
    xs.push(sample.meters);
    ys.push(altitude);
  }

  const count = xs.length;
  if (
    count < MIN_ALTITUDE_SAMPLES ||
    count < samples.length * MIN_ALTITUDE_SHARE
  ) {
    return null;
  }
  const first = nth(ys, 0);
  if (!ys.some((y) => y !== first)) return null;

  // Moving average over a distance window, two pointers over sorted metres.
  const half = GAP_SMOOTHING_WINDOW_METERS / 2;
  const smoothed: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const here = nth(xs, i);
    while (hi < count && nth(xs, hi) <= here + half) {
      sum += nth(ys, hi);
      hi++;
    }
    while (lo < count && nth(xs, lo) < here - half) {
      sum -= nth(ys, lo);
      lo++;
    }
    smoothed.push(sum / (hi - lo));
  }

  const altitudeAt = (meters: number): number | null => {
    if (!Number.isFinite(meters)) return null;
    if (meters < nth(xs, 0) || meters > nth(xs, count - 1)) return null;
    let a = 0;
    let b = count - 1;
    while (b - a > 1) {
      const mid = (a + b) >> 1;
      if (nth(xs, mid) <= meters) a = mid;
      else b = mid;
    }
    const span = nth(xs, b) - nth(xs, a);
    if (!(span > 0)) return nth(smoothed, a);
    const share = (meters - nth(xs, a)) / span;
    return (
      nth(smoothed, a) +
      (nth(smoothed, b) - nth(smoothed, a)) * Math.min(1, Math.max(0, share))
    );
  };

  return {
    gradePercent(fromMeters, toMeters) {
      const run = toMeters - fromMeters;
      if (!(run >= GAP_MIN_GRADE_SPAN_METERS)) return null;
      const start = altitudeAt(fromMeters);
      const end = altitudeAt(toMeters);
      if (start == null || end == null) return null;
      return clampGrade(((end - start) / run) * 100);
    },
  };
}

/** A stretch of a run with its gradient, for averaging. */
export interface GradedWindow {
  meters: number;
  seconds: number;
  /** Null when the stretch had no usable gradient. */
  gradePercent: number | null;
}

/**
 * Average grade-adjusted pace over a run, in seconds per `unitMeters`: total
 * moving time over the flat-equivalent distance, so a steep stretch counts for
 * as much as the effort it took rather than as an average of paces. Null when
 * the stretches with a gradient cover less than 80% of the distance, so a run
 * with patchy elevation gets no number instead of a flattering one.
 */
export function averageGradeAdjustedPace(
  windows: readonly GradedWindow[],
  unitMeters: number,
): number | null {
  if (!(unitMeters > 0)) return null;
  let totalMeters = 0;
  let gradedMeters = 0;
  let gradedSeconds = 0;
  let equivalentMeters = 0;
  for (const window of windows) {
    if (!(window.meters > 0) || !(window.seconds > 0)) continue;
    totalMeters += window.meters;
    if (window.gradePercent == null) continue;
    gradedMeters += window.meters;
    gradedSeconds += window.seconds;
    equivalentMeters +=
      window.meters * gradeAdjustmentFactor(window.gradePercent);
  }
  if (
    !(totalMeters > 0) ||
    gradedMeters < totalMeters * MIN_GRADED_DISTANCE_SHARE
  ) {
    return null;
  }
  if (!(equivalentMeters > 0)) return null;
  return (gradedSeconds / equivalentMeters) * unitMeters;
}
