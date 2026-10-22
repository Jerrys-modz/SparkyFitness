import { describe, expect, it } from 'vitest';
import {
  runningDynamicsSeries,
  summarizeRunningDynamics,
  verticalRatioPercent,
} from '@workspace/shared';

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 18, 7, 0, seconds)).toISOString();

describe('verticalRatioPercent', () => {
  it('is vertical oscillation over step length, as a percentage', () => {
    // 80 mm over a 1.00 m step.
    expect(verticalRatioPercent(80, 100)).toBe(8);
    // 81 mm over a 104.3 cm step.
    expect(verticalRatioPercent(81, 104.3)).toBe(7.8);
  });

  it('is null unless both readings are plausible', () => {
    expect(verticalRatioPercent(null, 100)).toBeNull();
    expect(verticalRatioPercent(80, null)).toBeNull();
    expect(verticalRatioPercent(undefined, undefined)).toBeNull();
    expect(verticalRatioPercent(0, 100)).toBeNull();
    expect(verticalRatioPercent(80, 0)).toBeNull();
    // Centimetres sent where millimetres belong.
    expect(verticalRatioPercent(8, 100)).toBeNull();
    // Metres sent where centimetres belong.
    expect(verticalRatioPercent(80, 1.04)).toBeNull();
  });
});

describe('summarizeRunningDynamics', () => {
  const run = [
    { t: at(0), gct: 240, vo: 80, stride: 100, power: 220 },
    { t: at(10), gct: 250, vo: 84, stride: 104, power: 230 },
    { t: at(20), gct: 260, vo: 88, stride: 108, power: 240 },
    { t: at(30), gct: 250, vo: 84, stride: 104, power: 230 },
  ];

  it('averages what the track carries', () => {
    expect(summarizeRunningDynamics(run)).toEqual({
      groundContactTimeMs: 250,
      verticalOscillationMm: 84,
      strideLengthCm: 104,
      powerWatts: 230,
      verticalRatioPercent: 8.1,
    });
  });

  it('leaves out a metric the track does not have', () => {
    const summary = summarizeRunningDynamics(
      run.map(({ t, gct }) => ({ t, gct }))
    );
    expect(summary.groundContactTimeMs).toBe(250);
    expect(summary.verticalOscillationMm).toBeNull();
    expect(summary.strideLengthCm).toBeNull();
    expect(summary.powerWatts).toBeNull();
    // Derived from two measured values, so it needs both.
    expect(summary.verticalRatioPercent).toBeNull();
  });

  it('gives nothing for a track with no dynamics or no points', () => {
    const empty = {
      groundContactTimeMs: null,
      verticalOscillationMm: null,
      strideLengthCm: null,
      powerWatts: null,
      verticalRatioPercent: null,
    };
    expect(summarizeRunningDynamics([])).toEqual(empty);
    expect(summarizeRunningDynamics([{ t: at(0) }, { t: at(1) }])).toEqual(
      empty
    );
  });

  it('needs a few readings before it calls it an average', () => {
    const two = run.slice(0, 2);
    expect(summarizeRunningDynamics(two).groundContactTimeMs).toBeNull();
  });

  it('ignores zeros and glitches rather than averaging them in', () => {
    const noisy = [
      ...run,
      { t: at(40), gct: 0, vo: 0, stride: 0, power: 0 },
      { t: at(50), gct: 9999, vo: 9999, stride: 9999, power: 99999 },
      { t: at(60), gct: Number.NaN },
    ];
    expect(summarizeRunningDynamics(noisy)).toEqual(
      summarizeRunningDynamics(run)
    );
  });
});

describe('runningDynamicsSeries', () => {
  const points = [
    { t: at(120), gct: 260 },
    { t: at(0), gct: 240 },
    { t: at(60), gct: 250 },
    { t: at(90) },
    { t: at(30), gct: 0 },
  ];

  it('is in time order, in minutes from the first reading', () => {
    expect(runningDynamicsSeries(points, 'groundContactTimeMs')).toEqual([
      { elapsedMinutes: 0, value: 240 },
      { elapsedMinutes: 1, value: 250 },
      { elapsedMinutes: 2, value: 260 },
    ]);
  });

  it('is empty for a metric with too few readings', () => {
    expect(runningDynamicsSeries(points, 'verticalOscillationMm')).toEqual([]);
    expect(runningDynamicsSeries(points, 'powerWatts')).toEqual([]);
    expect(runningDynamicsSeries([], 'strideLengthCm')).toEqual([]);
  });

  it('reads the vertical ratio per point from oscillation and step length', () => {
    const run = [
      { t: at(0), vo: 80, stride: 100 },
      { t: at(60), vo: 90, stride: 100 },
      // Only one of the two: no ratio for this point.
      { t: at(90), vo: 85 },
      { t: at(120), vo: 100, stride: 125 },
    ];
    expect(runningDynamicsSeries(run, 'verticalRatioPercent')).toEqual([
      { elapsedMinutes: 0, value: 8 },
      { elapsedMinutes: 1, value: 9 },
      { elapsedMinutes: 2, value: 8 },
    ]);
  });

  it('has no ratio series when a metric is missing entirely', () => {
    const run = [
      { t: at(0), vo: 80 },
      { t: at(60), vo: 90 },
      { t: at(120), vo: 85 },
    ];
    expect(runningDynamicsSeries(run, 'verticalRatioPercent')).toEqual([]);
  });
});
