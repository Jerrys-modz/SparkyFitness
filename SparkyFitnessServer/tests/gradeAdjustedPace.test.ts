import { describe, expect, it } from 'vitest';
import {
  GAP_MAX_GRADE_PERCENT,
  averageGradeAdjustedPace,
  buildElevationProfile,
  gradeAdjustedPace,
  gradeAdjustmentFactor,
  runningCostPerMeter,
  type ElevationSample,
} from '@workspace/shared';

/** A track of one sample every 10 m, with altitude from a function of distance. */
const track = (
  meters: number,
  altitude: (m: number) => number | null,
  extra: Partial<ElevationSample> = {}
): ElevationSample[] =>
  Array.from({ length: Math.floor(meters / 10) + 1 }, (_, i) => ({
    meters: i * 10,
    altitude: altitude(i * 10),
    ...extra,
  }));

describe('runningCostPerMeter (Minetti 2002)', () => {
  it('is the published 3.6 J/kg/m on the flat', () => {
    expect(runningCostPerMeter(0)).toBeCloseTo(3.6, 10);
  });

  it('matches the polynomial at +10% and -10%', () => {
    // 155.4 i^5 - 30.4 i^4 - 43.3 i^3 + 46.3 i^2 + 19.5 i + 3.6
    expect(runningCostPerMeter(10)).toBeCloseTo(5.968214, 6);
    expect(runningCostPerMeter(-10)).toBeCloseTo(2.151706, 6);
  });

  it('costs more uphill and less on a moderate downhill', () => {
    expect(runningCostPerMeter(5)).toBeGreaterThan(runningCostPerMeter(0));
    expect(runningCostPerMeter(-5)).toBeLessThan(runningCostPerMeter(0));
  });

  it('clamps the gradient to +-20%', () => {
    expect(GAP_MAX_GRADE_PERCENT).toBe(20);
    expect(runningCostPerMeter(45)).toBe(runningCostPerMeter(20));
    expect(runningCostPerMeter(-45)).toBe(runningCostPerMeter(-20));
    expect(runningCostPerMeter(1000)).toBe(runningCostPerMeter(20));
  });
});

describe('gradeAdjustmentFactor', () => {
  it('is 1 on the flat', () => {
    expect(gradeAdjustmentFactor(0)).toBeCloseTo(1, 10);
  });

  it('is the cost relative to flat', () => {
    expect(gradeAdjustmentFactor(10)).toBeCloseTo(5.968214 / 3.6, 5);
  });
});

describe('gradeAdjustedPace', () => {
  it('leaves a flat pace alone', () => {
    expect(gradeAdjustedPace(360, 0)).toBeCloseTo(360, 8);
  });

  it('is faster than the actual pace uphill', () => {
    const gap = gradeAdjustedPace(420, 8) as number;
    expect(gap).toBeLessThan(420);
    expect(gap).toBeCloseTo(420 / gradeAdjustmentFactor(8), 8);
  });

  it('is slower than the actual pace on a moderate downhill', () => {
    expect(gradeAdjustedPace(300, -6) as number).toBeGreaterThan(300);
  });

  it('is symmetric in the sense that the uphill factor exceeds the downhill one', () => {
    expect(gradeAdjustmentFactor(8)).toBeGreaterThan(1);
    expect(gradeAdjustmentFactor(-8)).toBeLessThan(1);
  });

  it('uses the clamped gradient for an absurd slope', () => {
    expect(gradeAdjustedPace(400, 80)).toBe(gradeAdjustedPace(400, 20));
  });

  it('refuses a pace or gradient that is not a number', () => {
    expect(gradeAdjustedPace(0, 3)).toBeNull();
    expect(gradeAdjustedPace(-5, 3)).toBeNull();
    expect(gradeAdjustedPace(Number.NaN, 3)).toBeNull();
    expect(gradeAdjustedPace(300, Number.NaN)).toBeNull();
    expect(gradeAdjustedPace(300, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('buildElevationProfile', () => {
  it('reads a steady climb as its gradient', () => {
    const profile = buildElevationProfile(track(500, (m) => 100 + m * 0.05));
    expect(profile?.gradePercent(100, 300)).toBeCloseTo(5, 6);
  });

  it('reads a descent as a negative gradient', () => {
    const profile = buildElevationProfile(track(500, (m) => 200 - m * 0.03));
    expect(profile?.gradePercent(50, 450)).toBeCloseTo(-3, 6);
  });

  it('smooths altitude noise instead of reporting it as terrain', () => {
    // Flat ground with +-3 m alternating GPS jitter.
    const noisy = track(600, (m) => 50 + ((m / 10) % 2 === 0 ? 3 : -3));
    const profile = buildElevationProfile(noisy);
    const grade = profile?.gradePercent(100, 160) as number;
    // Raw point-to-point would read +-60%; smoothed it stays well under 3%.
    expect(Math.abs(grade)).toBeLessThan(3);
  });

  it('clamps a cliff to +-20%', () => {
    const profile = buildElevationProfile(
      track(400, (m) => (m < 200 ? 0 : 100))
    );
    expect(profile?.gradePercent(150, 250)).toBe(20);
    const down = buildElevationProfile(track(400, (m) => (m < 200 ? 100 : 0)));
    expect(down?.gradePercent(150, 250)).toBe(-20);
  });

  it('gives no gradient over less than the minimum span', () => {
    const profile = buildElevationProfile(track(500, (m) => m * 0.05));
    expect(profile?.gradePercent(100, 120)).toBeNull();
    expect(profile?.gradePercent(100, 100)).toBeNull();
    expect(profile?.gradePercent(300, 200)).toBeNull();
  });

  it('gives no gradient outside the altitude data', () => {
    const profile = buildElevationProfile(track(500, (m) => m * 0.05));
    expect(profile?.gradePercent(-50, 100)).toBeNull();
    expect(profile?.gradePercent(400, 900)).toBeNull();
    expect(profile?.gradePercent(Number.NaN, 100)).toBeNull();
  });

  describe('returns null when the track has no elevation to speak of', () => {
    it('with no altitude at all', () => {
      expect(buildElevationProfile(track(500, () => null))).toBeNull();
    });

    it('with too few readings', () => {
      expect(buildElevationProfile(track(60, (m) => m * 0.05))).toBeNull();
    });

    it('when only a minority of points carry altitude', () => {
      const samples = track(1000, (m) => (m < 250 ? m * 0.05 : null));
      expect(buildElevationProfile(samples)).toBeNull();
    });

    it('when the altitude never changes (a stuck sensor)', () => {
      expect(buildElevationProfile(track(500, () => 12))).toBeNull();
    });

    it('with an empty track', () => {
      expect(buildElevationProfile([])).toBeNull();
    });
  });

  it('ignores readings whose vertical accuracy is bad or invalid', () => {
    const samples = track(600, (m) => m * 0.04);
    // One reading in five is garbage with a bad accuracy; the good ones stay.
    const mixed = samples.map((s, i) =>
      i % 5 !== 1
        ? s
        : { ...s, altitude: 9999, verticalAccuracy: i % 10 === 1 ? -1 : 80 }
    );
    const profile = buildElevationProfile(mixed);
    expect(profile?.gradePercent(100, 400)).toBeCloseTo(4, 1);
  });

  it('gives up when most readings have a bad accuracy', () => {
    const samples = track(600, (m) => m * 0.04, { verticalAccuracy: 80 });
    expect(buildElevationProfile(samples)).toBeNull();
  });

  it('drops a reading whose distance steps backwards', () => {
    const samples = track(500, (m) => m * 0.05);
    samples.splice(20, 0, { meters: 5, altitude: 5000 });
    const profile = buildElevationProfile(samples);
    expect(profile?.gradePercent(100, 300)).toBeCloseTo(5, 1);
  });
});

describe('averageGradeAdjustedPace', () => {
  const KM = 1000;

  it('equals the plain pace on the flat', () => {
    const windows = [
      { meters: 100, seconds: 36, gradePercent: 0 },
      { meters: 100, seconds: 36, gradePercent: 0 },
    ];
    expect(averageGradeAdjustedPace(windows, KM)).toBeCloseTo(360, 6);
  });

  it('is faster than the plain pace over a climb', () => {
    const windows = [{ meters: 200, seconds: 80, gradePercent: 6 }];
    const plain = (80 / 200) * KM;
    const gap = averageGradeAdjustedPace(windows, KM) as number;
    expect(gap).toBeLessThan(plain);
    expect(gap).toBeCloseTo(plain / gradeAdjustmentFactor(6), 6);
  });

  it('weights by effort, not by averaging paces', () => {
    // Up then down at the same plain pace: the climb counts for more distance.
    const windows = [
      { meters: 100, seconds: 40, gradePercent: 10 },
      { meters: 100, seconds: 40, gradePercent: -10 },
    ];
    const equivalent =
      100 * gradeAdjustmentFactor(10) + 100 * gradeAdjustmentFactor(-10);
    expect(averageGradeAdjustedPace(windows, KM)).toBeCloseTo(
      (80 / equivalent) * KM,
      6
    );
  });

  it('works in miles', () => {
    const windows = [{ meters: 400, seconds: 160, gradePercent: 0 }];
    expect(averageGradeAdjustedPace(windows, 1609.344)).toBeCloseTo(
      (160 / 400) * 1609.344,
      6
    );
  });

  it('gives nothing when too little of the run has a gradient', () => {
    const windows = [
      { meters: 100, seconds: 36, gradePercent: 2 },
      { meters: 900, seconds: 324, gradePercent: null },
    ];
    expect(averageGradeAdjustedPace(windows, KM)).toBeNull();
  });

  it('still averages when the gaps are small', () => {
    const windows = [
      { meters: 900, seconds: 324, gradePercent: 0 },
      { meters: 100, seconds: 36, gradePercent: null },
    ];
    expect(averageGradeAdjustedPace(windows, KM)).toBeCloseTo(360, 6);
  });

  it('gives nothing for no usable windows or a bad unit', () => {
    expect(averageGradeAdjustedPace([], KM)).toBeNull();
    expect(
      averageGradeAdjustedPace([{ meters: 0, seconds: 0, gradePercent: 1 }], KM)
    ).toBeNull();
    expect(
      averageGradeAdjustedPace([{ meters: 10, seconds: 5, gradePercent: 1 }], 0)
    ).toBeNull();
  });
});
