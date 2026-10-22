import type { GpsTrackPoint } from '@workspace/shared';
import { gradeAdjustmentFactor } from '@workspace/shared';
import {
  gradeAdjustedAveragePace,
  processGpsPointsToChartData,
  resolveRunningDynamics,
} from '@/utils/activityReportUtil';

jest.mock('i18next', () => ({
  t: (key: string) => key,
}));

const identity = (value: number) => value;
const T0 = Date.UTC(2026, 9, 18, 7, 0, 0);

/** 4 m/s north, a fix every 10 s, climbing `grade` percent. */
const run = (
  grade: number,
  extra: Partial<GpsTrackPoint> | ((i: number) => Partial<GpsTrackPoint>) = {},
  fixes = 60
): GpsTrackPoint[] =>
  Array.from({ length: fixes }, (_, i) => ({
    t: new Date(T0 + i * 10_000).toISOString(),
    lat: 51.5 + (i * 40) / 111_194.9,
    lon: -0.1,
    speed: 4,
    dist: i * 40,
    alt: 100 + i * 40 * (grade / 100),
    ...(typeof extra === 'function' ? extra(i) : extra),
  }));

describe('grade adjusted pace on the chart points', () => {
  it('is faster than the plain pace on a climb, on the points that can be graded', () => {
    const data = processGpsPointsToChartData(run(6), identity, 'km');
    const middle = data[30];
    expect(middle?.pace).toBeCloseTo(4.17, 2);
    expect(middle?.gradeAdjustedPace).toBeCloseTo(
      4.17 / gradeAdjustmentFactor(6),
      1
    );
    expect(middle?.gradeAdjustedPace as number).toBeLessThan(
      middle?.pace as number
    );
  });

  it('is slower than the plain pace down a moderate descent', () => {
    const data = processGpsPointsToChartData(run(-5), identity, 'km');
    expect(data[30]?.gradeAdjustedPace as number).toBeGreaterThan(
      data[30]?.pace as number
    );
  });

  it('leaves the first and last stretch ungraded rather than guessing', () => {
    const data = processGpsPointsToChartData(run(6), identity, 'km');
    expect(data[0]?.gradeAdjustedPace).toBeNull();
    expect(data[data.length - 1]?.gradeAdjustedPace).toBeNull();
  });

  it('is null on every point when the track has no altitude', () => {
    const data = processGpsPointsToChartData(
      run(6, { alt: undefined }),
      identity,
      'km'
    );
    expect(data.every((d) => d.gradeAdjustedPace == null)).toBe(true);
  });

  it('is null on every point when the altitude never changes', () => {
    const data = processGpsPointsToChartData(
      run(6, { alt: 90 }),
      identity,
      'km'
    );
    expect(data.every((d) => d.gradeAdjustedPace == null)).toBe(true);
  });

  it('works out the distance itself when the track has no dist', () => {
    const data = processGpsPointsToChartData(
      run(6, { dist: undefined }),
      identity,
      'km'
    );
    expect(data[30]?.gradeAdjustedPace as number).toBeLessThan(
      data[30]?.pace as number
    );
  });
});

describe('gradeAdjustedAveragePace', () => {
  it('averages a climb to its flat equivalent, in minutes', () => {
    const minutes = gradeAdjustedAveragePace(run(6), 'km') as number;
    expect(minutes).toBeCloseTo(250 / 60 / gradeAdjustmentFactor(6), 1);
  });

  it('is per mile with the miles setting', () => {
    const km = gradeAdjustedAveragePace(run(6), 'km') as number;
    const mi = gradeAdjustedAveragePace(run(6), 'miles') as number;
    expect(mi / km).toBeCloseTo(1.609344, 3);
  });

  it('is null without elevation or without enough track', () => {
    expect(
      gradeAdjustedAveragePace(run(6, { alt: undefined }), 'km')
    ).toBeNull();
    expect(gradeAdjustedAveragePace(run(6, {}, 1), 'km')).toBeNull();
    expect(gradeAdjustedAveragePace(undefined, 'km')).toBeNull();
    expect(gradeAdjustedAveragePace([], 'km')).toBeNull();
  });
});

describe('running dynamics on the chart points', () => {
  const dynamicsRun = run(0, (i) => ({
    gct: 240 + (i % 3) * 5,
    vo: 80,
    stride: 100,
    power: 220,
  }));

  it('carries each measured metric, with oscillation in the display unit', () => {
    const [first] = processGpsPointsToChartData(dynamicsRun, identity, 'km');
    expect(first).toMatchObject({
      groundContactTime: 240,
      verticalOscillation: 8,
      verticalRatio: 8,
      power: 220,
    });
    const [miles] = processGpsPointsToChartData(dynamicsRun, identity, 'miles');
    expect(miles?.verticalOscillation).toBeCloseTo(3.15, 2);
  });

  it('leaves them null for a track without them', () => {
    const [first] = processGpsPointsToChartData(run(0), identity, 'km');
    expect(first?.groundContactTime).toBeNull();
    expect(first?.verticalOscillation).toBeNull();
    expect(first?.verticalRatio).toBeNull();
    expect(first?.power).toBeNull();
  });
});

describe('resolveRunningDynamics', () => {
  const points = run(0, { gct: 250, vo: 80, stride: 100, power: 200 });

  it('prefers the stored entry over the track', () => {
    expect(
      resolveRunningDynamics(
        {
          ground_contact_time_ms: '260.0',
          vertical_oscillation_mm: '90.0',
          stride_length_cm: '120.0',
          avg_power_watts: '240.00',
        },
        points
      )
    ).toEqual({
      groundContactTimeMs: 260,
      verticalOscillationMm: 90,
      verticalRatioPercent: 7.5,
      powerWatts: 240,
    });
  });

  it('falls back to the track, and to nothing', () => {
    expect(resolveRunningDynamics(undefined, points)).toEqual({
      groundContactTimeMs: 250,
      verticalOscillationMm: 80,
      verticalRatioPercent: 8,
      powerWatts: 200,
    });
    expect(resolveRunningDynamics({}, undefined)).toEqual({
      groundContactTimeMs: null,
      verticalOscillationMm: null,
      verticalRatioPercent: null,
      powerWatts: null,
    });
  });

  it('treats a zero or empty column as not measured', () => {
    expect(
      resolveRunningDynamics(
        { ground_contact_time_ms: 0, avg_power_watts: '' },
        undefined
      )
    ).toEqual({
      groundContactTimeMs: null,
      verticalOscillationMm: null,
      verticalRatioPercent: null,
      powerWatts: null,
    });
  });
});
