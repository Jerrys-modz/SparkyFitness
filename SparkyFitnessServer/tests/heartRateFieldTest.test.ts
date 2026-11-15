import { describe, expect, it } from 'vitest';
import {
  evaluateHeartRateFieldTest,
  peakHeartRateFromTest,
  resolveHeartRateZones,
  thresholdHeartRateFloors,
  thresholdHeartRateFromThirtyMinuteRun,
  type HrSample,
} from '@workspace/shared';

const START = '2026-11-01T08:00:00.000Z';
const startMs = Date.parse(START);

/** One reading every `step` seconds from `fromS` to `toS`, bpm from `bpmAt`. */
function series(
  fromS: number,
  toS: number,
  bpmAt: (s: number) => number,
  step = 5
): HrSample[] {
  const out: HrSample[] = [];
  for (let s = fromS; s <= toS; s += step) {
    out.push({ t: new Date(startMs + s * 1000).toISOString(), bpm: bpmAt(s) });
  }
  return out;
}

describe('thresholdHeartRateFromThirtyMinuteRun', () => {
  it('averages only the last 20 minutes', () => {
    // 150 for the first 10 minutes, 170 after.
    const samples = series(0, 1800, (s) => (s < 600 ? 150 : 170));
    expect(thresholdHeartRateFromThirtyMinuteRun(samples, START)).toBe(170);
  });

  it('weights by time, not by reading count', () => {
    // Dense readings at 160 for the first 10 of the last 20 minutes, sparse at 180 after.
    const dense = series(600, 1195, () => 160, 1);
    const sparse = series(1200, 1800, () => 180, 30);
    expect(
      thresholdHeartRateFromThirtyMinuteRun([...dense, ...sparse], START)
    ).toBe(170);
  });

  it('refuses a strap that dropped out for most of the window', () => {
    const samples = series(600, 900, () => 170);
    expect(thresholdHeartRateFromThirtyMinuteRun(samples, START)).toBeNull();
  });

  it('refuses an unbelievable threshold or a bad start time', () => {
    expect(
      thresholdHeartRateFromThirtyMinuteRun(
        series(0, 1800, () => 80),
        START
      )
    ).toBeNull();
    expect(
      thresholdHeartRateFromThirtyMinuteRun(
        series(0, 1800, () => 170),
        'x'
      )
    ).toBeNull();
  });
});

describe('peakHeartRateFromTest', () => {
  it('ignores a single spike', () => {
    const samples = series(0, 600, (s) => (s === 300 ? 230 : 180), 1);
    expect(peakHeartRateFromTest(samples)).toBe(180);
  });

  it('finds the finishing kick', () => {
    const samples = series(0, 720, (s) => (s > 690 ? 196 : 182), 1);
    expect(peakHeartRateFromTest(samples)).toBe(196);
  });

  it('returns null with too few readings', () => {
    expect(peakHeartRateFromTest([])).toBeNull();
  });
});

describe('thresholdHeartRateFloors', () => {
  it('gives Friel running floors that save as custom zones', () => {
    const floors = thresholdHeartRateFloors(170)!;
    expect(floors).toEqual([119, 145, 153, 162, 170]);
    const resolved = resolveHeartRateZones({
      settings: { method: 'custom', customFloors: floors },
      today: '2026-11-01',
    });
    expect(resolved.effectiveMethod).toBe('custom');
    expect(resolved.zones[4]!.lowerBpm).toBe(170);
  });

  it('refuses thresholds outside 100 to 220', () => {
    expect(thresholdHeartRateFloors(90)).toBeNull();
    expect(thresholdHeartRateFloors(230)).toBeNull();
  });
});

describe('evaluateHeartRateFieldTest', () => {
  const samples = series(
    0,
    1800,
    (s) => (s < 600 ? 155 : s > 1780 ? 192 : 172),
    1
  );

  it('gives threshold zones only for the 30-minute run', () => {
    const thirty = evaluateHeartRateFieldTest({
      testType: '30min',
      samples,
      startedAt: START,
      currentMaxHr: 185,
    });
    expect(thirty.thresholdHr).toBe(172);
    expect(thirty.floors).toHaveLength(5);
    expect(thirty.peakHr).toBe(192);
    expect(thirty.suggestedMaxHr).toBe(192);

    const fiveK = evaluateHeartRateFieldTest({
      testType: '5k',
      samples,
      startedAt: START,
      currentMaxHr: 185,
    });
    expect(fiveK.thresholdHr).toBeNull();
    expect(fiveK.floors).toBeNull();
    expect(fiveK.peakHr).toBe(192);
  });

  it('does not suggest a max lower than the one in use', () => {
    const result = evaluateHeartRateFieldTest({
      testType: 'cooper',
      samples,
      startedAt: START,
      currentMaxHr: 200,
    });
    expect(result.suggestedMaxHr).toBeNull();
  });
});
