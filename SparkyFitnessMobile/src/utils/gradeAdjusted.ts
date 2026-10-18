import type { TrackSample } from '@workspace/shared';
import type { RecordedPoint } from './gpsRecording';
import { cumulativeActiveSeconds, cumulativeDistances } from './gpsRecording';

/**
 * Adapters from a phone or watch recording to the shared grade-adjusted pace
 * maths (`gradeAdjustedPace.ts` and `gradeAdjustedTrack.ts` in
 * `@workspace/shared`).
 */

/**
 * A recording's fixes as samples: time is the active clock (pauses removed) so
 * a pause never reads as a slow stretch.
 */
export function samplesFromRecording(
  points: readonly RecordedPoint[]
): TrackSample[] {
  const distances = cumulativeDistances(points);
  const active = cumulativeActiveSeconds(points);
  const samples: TrackSample[] = [];
  for (let i = 0; i < points.length; i++) {
    const t = active[i] * 1000;
    // The first fix after a pause lands on the same clock second; its
    // distance is unchanged too, so it adds nothing.
    if (samples.length > 0 && t <= samples[samples.length - 1].t) continue;
    samples.push({
      t,
      meters: distances[i],
      altitude: points[i].alt,
      verticalAccuracy: points[i].vacc,
    });
  }
  return samples;
}

/** Consecutive distance ranges of splits or laps, by their lengths. */
export function rangesOfSplits(
  splits: readonly { distanceMeters: number }[]
): { fromMeters: number; toMeters: number }[] {
  let from = 0;
  return splits.map((split) => {
    const range = { fromMeters: from, toMeters: from + split.distanceMeters };
    from = range.toMeters;
    return range;
  });
}
