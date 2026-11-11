import { describe, expect, it } from 'vitest';
import {
  bestAveragePower,
  computeTimeInPowerZones,
  estimateCriticalPower,
  normalizedPower,
  runSensorSeries,
  runningPowerZoneIndex,
  summarizeRunningDynamics,
  summarizeRunningPower,
  type RunSensorPoint,
} from '@workspace/shared';

const START = Date.parse('2026-10-13T07:00:00Z');
/** One point per second for `seconds`, each built by `make(second)`. */
const track = (
  seconds: number,
  make: (second: number) => Partial<RunSensorPoint>
): RunSensorPoint[] =>
  Array.from({ length: seconds }, (_, i) => ({
    t: new Date(START + i * 1000).toISOString(),
    ...make(i),
  }));

describe('normalizedPower', () => {
  it('equals the power for a steady effort', () => {
    expect(normalizedPower(track(120, () => ({ power: 250 })))).toBeCloseTo(
      250,
      5
    );
  });
  it('is above the average for a surging effort', () => {
    const points = track(240, (s) => ({
      power: Math.floor(s / 60) % 2 ? 350 : 150,
    }));
    const summary = summarizeRunningPower(points)!;
    expect(summary.averageWatts).toBe(250);
    expect(summary.normalizedWatts!).toBeGreaterThan(250);
    expect(summary.variabilityIndex!).toBeGreaterThan(1);
  });
  it('is null under 30 seconds', () => {
    expect(normalizedPower(track(20, () => ({ power: 200 })))).toBeNull();
  });
});

describe('critical power and zones', () => {
  it('takes 95% of the best 20 minutes', () => {
    const points = track(30 * 60, (s) => ({ power: s < 600 ? 150 : 300 }));
    expect(bestAveragePower(points, 1200)).toBeCloseTo(300, 5);
    expect(estimateCriticalPower(points)).toBe(285);
  });
  it('gives no estimate for a short run', () => {
    expect(
      estimateCriticalPower(track(600, () => ({ power: 300 })))
    ).toBeNull();
  });
  it('puts power in the right zone', () => {
    expect(runningPowerZoneIndex(150, 300)).toBe(0);
    expect(runningPowerZoneIndex(250, 300)).toBe(1);
    expect(runningPowerZoneIndex(280, 300)).toBe(2);
    expect(runningPowerZoneIndex(300, 300)).toBe(3);
    expect(runningPowerZoneIndex(400, 300)).toBe(4);
  });
  it('counts seconds in each zone', () => {
    const points = track(100, (s) => ({ power: s < 40 ? 150 : 400 }));
    const zones = computeTimeInPowerZones(points, 300);
    expect(zones[0]).toBe(40);
    expect(zones[4]).toBe(60);
  });
});

describe('power to heart rate decoupling', () => {
  it('is positive when heart rate climbs at the same power', () => {
    const points = track(30 * 60, (s) => ({
      power: 250,
      hr: s < 900 ? 140 : 154,
    }));
    expect(summarizeRunningPower(points)!.decouplingPercent).toBeCloseTo(
      9.1,
      1
    );
  });
});

describe('running dynamics', () => {
  it('summarizes and derives the vertical ratio', () => {
    const points = track(60, () => ({ gct: 240, vo: 90, stride: 120 }));
    const summary = summarizeRunningDynamics(points)!;
    expect(summary.groundContactMs).toBe(240);
    expect(summary.verticalRatioPercent).toBe(7.5);
    expect(summary.groundContactDriftPercent).toBeNull();
  });
  it('measures ground contact drift over a long run', () => {
    const points = track(30 * 60, (s) => ({ gct: 220 + s / 60 }));
    expect(
      summarizeRunningDynamics(points)!.groundContactDriftPercent!
    ).toBeGreaterThan(5);
  });
  it('ignores implausible readings and returns null with none', () => {
    expect(
      summarizeRunningDynamics(track(30, () => ({ gct: 5000 })))
    ).toBeNull();
    expect(summarizeRunningDynamics(track(30, () => ({ hr: 150 })))).toBeNull();
  });
  it('builds a chart series in minutes from the start', () => {
    const series = runSensorSeries(
      track(120, () => ({ gct: 250 })),
      'gct'
    );
    expect(series[0]).toEqual({ minute: 0, value: 250 });
    expect(series[119]!.minute).toBeCloseTo(119 / 60, 5);
  });
});
