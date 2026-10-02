import { describe, expect, it } from 'vitest';
import { calculateWarmupSets, findWarmupBaseIndex } from '@workspace/shared';

describe('calculateWarmupSets', () => {
  it('ramps the bar, 50%, 70% and 85% in kilograms, rounded to 2.5', () => {
    // 100 kg: bar x10, 50 x5, 70 x3, 85 x1
    expect(calculateWarmupSets(100, 'kg')).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 50, reps: 5 },
      { weightKg: 70, reps: 3 },
      { weightKg: 85, reps: 1 },
    ]);
  });

  it('rounds each step to a loadable weight', () => {
    // 82.5 kg: 41.25 -> 42.5 (halves round up), 57.75 -> 57.5, 70.125 -> 70
    expect(calculateWarmupSets(82.5, 'kg').map((s) => s.weightKg)).toEqual([
      20, 42.5, 57.5, 70,
    ]);
  });

  it('works in pounds and returns kilograms', () => {
    // 225 lb: bar 45, 112.5 -> 115, 157.5 -> 160, 191.25 -> 190
    const sets = calculateWarmupSets(225 * 0.45359237, 'lbs');
    expect(sets.map((s) => s.reps)).toEqual([10, 5, 3, 1]);
    expect(sets.map((s) => Math.round(s.weightKg / 0.45359237))).toEqual([
      45, 115, 160, 190,
    ]);
  });

  it('drops steps that would not climb, so a light weight gets a shorter ramp', () => {
    // 30 kg: 15 -> 15 (under the bar), 21 -> 20 (not above the bar), 25.5 -> 25
    expect(calculateWarmupSets(30, 'kg')).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 25, reps: 1 },
    ]);
  });

  it('gives nothing when the working weight is not above the bar', () => {
    expect(calculateWarmupSets(20, 'kg')).toEqual([]);
    expect(calculateWarmupSets(15, 'kg')).toEqual([]);
    expect(calculateWarmupSets(45 * 0.45359237, 'lbs')).toEqual([]);
  });

  it('gives nothing for a missing or invalid weight', () => {
    expect(calculateWarmupSets(0, 'kg')).toEqual([]);
    expect(calculateWarmupSets(-5, 'kg')).toEqual([]);
    expect(calculateWarmupSets(Number.NaN, 'kg')).toEqual([]);
  });

  it('never reaches the working weight', () => {
    for (const w of [22.5, 27.5, 40, 62.5, 140, 200]) {
      const sets = calculateWarmupSets(w, 'kg');
      expect(sets.every((s) => s.weightKg < w)).toBe(true);
      const weights = sets.map((s) => s.weightKg);
      expect([...weights].sort((a, b) => a - b)).toEqual(weights);
    }
  });
});

describe('findWarmupBaseIndex', () => {
  it('is the first working set, skipping warm-up and drop sets', () => {
    expect(
      findWarmupBaseIndex([
        { set_type: 'warmup', weight: 20 },
        { set_type: 'drop', weight: 60 },
        { set_type: 'normal', weight: 100 },
        { set_type: 'normal', weight: 105 },
      ])
    ).toBe(2);
  });

  it('uses a supplied placeholder weight for an untouched set', () => {
    expect(
      findWarmupBaseIndex([{ set_type: 'normal', weight: null }], () => 80)
    ).toBe(0);
  });

  it('is -1 when the first working set has no weight', () => {
    expect(findWarmupBaseIndex([{ set_type: 'normal', weight: null }])).toBe(
      -1
    );
    expect(findWarmupBaseIndex([{ set_type: 'warmup', weight: 20 }])).toBe(-1);
    expect(findWarmupBaseIndex([])).toBe(-1);
  });
});
