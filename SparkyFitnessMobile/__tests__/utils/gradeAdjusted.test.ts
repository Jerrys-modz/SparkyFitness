import {
  rangesOfSplits,
  samplesFromRecording,
} from '../../src/utils/gradeAdjusted';
import type { RecordedPoint } from '../../src/utils/gpsRecording';

describe('samplesFromRecording', () => {
  const fix = (
    t: number,
    metersNorth: number,
    seg: number,
    alt: number | null = 50
  ): RecordedPoint => ({
    t,
    lat: 51.5 + metersNorth / 111_194.9,
    lon: -0.1,
    alt,
    hacc: 5,
    vacc: 3,
    speed: null,
    course: null,
    seg,
  });

  it('runs on the active clock so a pause is not a slow stretch', () => {
    const points = [
      fix(0, 0, 0),
      fix(10_000, 40, 0),
      // Paused for ten minutes, resumed 5 m up the road.
      fix(610_000, 45, 1),
      fix(620_000, 85, 1),
    ];
    const result = samplesFromRecording(points);
    expect(result.map((s) => s.t)).toEqual([0, 10_000, 20_000]);
    expect(result[2].meters).toBeCloseTo(80, 0);
    expect(result[0].verticalAccuracy).toBe(3);
  });
});

describe('rangesOfSplits', () => {
  it('lays splits end to end', () => {
    expect(
      rangesOfSplits([
        { distanceMeters: 1000 },
        { distanceMeters: 1000 },
        { distanceMeters: 340 },
      ])
    ).toEqual([
      { fromMeters: 0, toMeters: 1000 },
      { fromMeters: 1000, toMeters: 2000 },
      { fromMeters: 2000, toMeters: 2340 },
    ]);
  });
});
