import { describe, expect, it } from 'vitest';
import { splitIndoorRunWalk, MIN_RUN_BELT_SPEED_MPS } from '@workspace/shared';

const MPH = 0.44704;

/**
 * A run like the one that showed the problem: 5 min of slow walking, 20 min of
 * running at a steady belt speed, 5 min of slow walking. The pedometer reads
 * the walking about 25% short and the running about 7% long, so a single
 * factor that fixes the total leaves the run block too fast.
 */
function pedometerRun(options: {
  walkMps: number;
  runMps: number;
  walkSeconds: number;
  runSeconds: number;
  gap?: number;
}): [number, number][] {
  const gap = options.gap ?? 12;
  const rows: [number, number][] = [];
  let t = 0;
  let m = 0;
  const phases: [number, number][] = [
    [options.walkSeconds, options.walkMps],
    [options.runSeconds, options.runMps],
    [options.walkSeconds, options.walkMps],
  ];
  for (const [seconds, speed] of phases) {
    for (let elapsed = 0; elapsed < seconds; elapsed += gap) {
      t += gap;
      m += gap * speed;
      rows.push([t, Math.round(m * 100) / 100]);
    }
  }
  return rows;
}

describe('splitIndoorRunWalk', () => {
  const belt = 5 * MPH; // 12:00 /mi
  // What the watch showed: walking short, running long.
  const shown = pedometerRun({
    walkMps: 0.97,
    runMps: belt * 1.067,
    walkSeconds: 300,
    runSeconds: 1200,
  });
  const shownTotal = shown[shown.length - 1]![1];

  it('keeps the run block at the belt speed and gives the walking the rest', () => {
    // The treadmill's total: 20 min at 5 mph plus 10 min of walking at 2.7 mph.
    const total = belt * 1200 + 2.7 * MPH * 600;
    const split = splitIndoorRunWalk(shown, total, belt);
    expect(split).not.toBeNull();
    const result = split!;
    expect(result.series.at(-1)![1]).toBeCloseTo(total, -1);
    // The run block's pace is the belt's, not the pedometer's.
    expect(result.runMeters / result.runSeconds).toBeCloseTo(belt, 3);
    expect(result.runFactor).toBeLessThan(1);
    expect(result.walkFactor).toBeGreaterThan(1);
    // A uniform scale to the same total would leave the run block fast.
    const uniform = total / shownTotal;
    expect(shownTotal * uniform).toBeCloseTo(total, 0);
    expect(result.shownRunMeters * uniform).toBeGreaterThan(result.runMeters);
  });

  it('is monotonic and keeps every row time', () => {
    const total = belt * 1200 + 2.7 * MPH * 600;
    const { series } = splitIndoorRunWalk(shown, total, belt)!;
    expect(series).toHaveLength(shown.length);
    series.forEach(([t, m], i) => {
      expect(t).toBe(shown[i]![0]);
      if (i > 0) expect(m).toBeGreaterThanOrEqual(series[i - 1]![1]);
    });
  });

  it('returns null for a belt that is a walk', () => {
    expect(
      splitIndoorRunWalk(shown, 3000, MIN_RUN_BELT_SPEED_MPS - 0.1)
    ).toBeNull();
  });

  it('returns null when the series has no walking in it', () => {
    const steady = pedometerRun({
      walkMps: belt,
      runMps: belt,
      walkSeconds: 300,
      runSeconds: 1200,
    });
    expect(splitIndoorRunWalk(steady, 4000, belt)).toBeNull();
  });

  it('returns null when the total is smaller than the run block alone', () => {
    expect(splitIndoorRunWalk(shown, belt * 1200 - 100, belt)).toBeNull();
  });

  it('returns null for factors no pedometer would be off by', () => {
    expect(splitIndoorRunWalk(shown, 12000, belt)).toBeNull();
  });

  it('returns null for rows that are out of order', () => {
    const bad: [number, number][] = [
      [12, 10],
      [24, 20],
      [20, 30],
      [32, 40],
    ];
    expect(splitIndoorRunWalk(bad, 100, belt)).toBeNull();
  });

  it('returns null for too few rows', () => {
    expect(splitIndoorRunWalk(shown.slice(0, 3), 100, belt)).toBeNull();
  });
});
