import {
  averageGradeAdjustedPace,
  buildElevationProfile,
  type ElevationProfile,
  type ElevationSample,
  type GradedWindow,
} from './gradeAdjustedPace.ts';

/**
 * Grade-adjusted pace over a whole track. The model and the gradient maths are
 * in `gradeAdjustedPace.ts`; this cuts a track into the same 30 second
 * stretches the pace charts use and grades each, so web and mobile report the
 * same figure for the same run.
 */

/** One reading along a track. */
export interface TrackSample extends ElevationSample {
  /** Epoch milliseconds, or milliseconds of active time for a recording. */
  t: number;
}

/** A stretch of at least `PACE_WINDOW_SECONDS`, with the gradient it climbed. */
export interface TrackWindow extends GradedWindow {
  startMeters: number;
  endMeters: number;
}

/** Each pace reading spans at least this long, which smooths GPS jitter. */
export const PACE_WINDOW_SECONDS = 30;

/**
 * Stretches slower than an hour per kilometre are standing still (or a pause
 * in a stored track) and are left out, as the pace charts leave them out.
 */
const MIN_MOVING_SPEED_MPS = 1000 / 3600;

/**
 * Stretches of at least `PACE_WINDOW_SECONDS` between samples. A stretch that
 * covers no distance, or crawls, is kept out (standing still); the clock still
 * moves on to its end so the next one starts there. `profile` grades them; with
 * null every stretch has no gradient.
 */
export function trackWindows(
  samples: readonly TrackSample[],
  profile: ElevationProfile | null
): TrackWindow[] {
  const windows: TrackWindow[] = [];
  let anchor = samples[0];
  if (!anchor) return windows;
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const seconds = (sample.t - anchor.t) / 1000;
    if (seconds < PACE_WINDOW_SECONDS) continue;
    const meters = sample.meters - anchor.meters;
    if (meters > 0 && meters / seconds >= MIN_MOVING_SPEED_MPS) {
      windows.push({
        startMeters: anchor.meters,
        endMeters: sample.meters,
        meters,
        seconds,
        gradePercent: profile
          ? profile.gradePercent(anchor.meters, sample.meters)
          : null,
      });
    }
    anchor = sample;
  }
  return windows;
}

export interface GradeAdjustedResult {
  /** Seconds per `unitMeters` over the whole track; null without elevation. */
  averageSecondsPerUnit: number | null;
  /** The same for each requested distance range, in order. */
  rangeSecondsPerUnit: (number | null)[];
}

/**
 * Average grade-adjusted pace for a track and for stretches of it (splits or
 * laps), in seconds per `unitMeters`. Every figure is null when the track has
 * no usable elevation, or when too little of a stretch has a gradient, so the
 * caller hides it rather than showing the plain pace under another name.
 */
export function gradeAdjustedForSamples(
  samples: readonly TrackSample[],
  unitMeters: number,
  ranges: readonly { fromMeters: number; toMeters: number }[] = []
): GradeAdjustedResult {
  const none: GradeAdjustedResult = {
    averageSecondsPerUnit: null,
    rangeSecondsPerUnit: ranges.map(() => null),
  };
  if (samples.length < 2 || !(unitMeters > 0)) return none;
  const profile = buildElevationProfile(samples);
  if (!profile) return none;
  const windows = trackWindows(samples, profile);
  return {
    averageSecondsPerUnit: averageGradeAdjustedPace(windows, unitMeters),
    rangeSecondsPerUnit: ranges.map(({ fromMeters, toMeters }) =>
      averageGradeAdjustedPace(
        windows.filter(
          (window) =>
            window.endMeters > fromMeters && window.endMeters <= toMeters
        ),
        unitMeters
      )
    ),
  };
}
