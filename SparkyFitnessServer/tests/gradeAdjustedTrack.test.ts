import { describe, expect, it } from 'vitest';
import {
  gradeAdjustedForSamples,
  gradeAdjustmentFactor,
  trackWindows,
  type TrackSample,
} from '@workspace/shared';

const KM = 1000;

/** 4 m/s, a fix every 10 s, altitude from a function of distance. */
const samples = (
  count: number,
  altitude: (meters: number) => number | null
): TrackSample[] =>
  Array.from({ length: count }, (_, i) => ({
    t: i * 10_000,
    meters: i * 40,
    altitude: altitude(i * 40),
  }));

describe('trackWindows', () => {
  it('cuts the track into stretches of at least thirty seconds', () => {
    const windows = trackWindows(
      samples(13, (m) => m * 0.05),
      null
    );
    expect(windows).toHaveLength(4);
    for (const window of windows) {
      expect(window.seconds).toBe(30);
      expect(window.meters).toBe(120);
      expect(window.gradePercent).toBeNull();
    }
  });

  it('leaves out a stretch where the person stood still', () => {
    const stopped: TrackSample[] = [
      { t: 0, meters: 0 },
      { t: 30_000, meters: 120 },
      { t: 60_000, meters: 120 },
      { t: 90_000, meters: 240 },
    ];
    expect(trackWindows(stopped, null)).toHaveLength(2);
  });
});

describe('gradeAdjustedForSamples', () => {
  it('averages a steady climb to its flat equivalent', () => {
    const result = gradeAdjustedForSamples(
      samples(40, (m) => m * 0.06),
      KM
    );
    expect(result.averageSecondsPerUnit).toBeCloseTo(
      250 / gradeAdjustmentFactor(6),
      0
    );
  });

  it('is null without elevation, and says so for every range', () => {
    const result = gradeAdjustedForSamples(
      samples(40, () => null),
      KM,
      [{ fromMeters: 0, toMeters: 500 }]
    );
    expect(result.averageSecondsPerUnit).toBeNull();
    expect(result.rangeSecondsPerUnit).toEqual([null]);
  });

  it('grades each split separately', () => {
    const track = samples(80, (m) =>
      m < 1600 ? m * 0.06 : 96 - (m - 1600) * 0.03
    );
    const result = gradeAdjustedForSamples(track, KM, [
      { fromMeters: 0, toMeters: 1000 },
      { fromMeters: 2000, toMeters: 3000 },
    ]);
    const [up, down] = result.rangeSecondsPerUnit;
    expect(up).toBeCloseTo(250 / gradeAdjustmentFactor(6), -1);
    expect(down as number).toBeGreaterThan(250);
  });

  it('is null for too few samples or a bad unit', () => {
    expect(gradeAdjustedForSamples([], KM).averageSecondsPerUnit).toBeNull();
    expect(
      gradeAdjustedForSamples(
        samples(40, (m) => m * 0.06),
        0
      ).averageSecondsPerUnit
    ).toBeNull();
  });
});
