import { describe, expect, test } from 'vitest';
import {
  correlationTest,
  effectiveN,
  lag1Autocorrelation,
  pearson,
  spearman,
  tCritical95,
  tTwoSidedP,
  welch,
} from '@workspace/shared';

describe('compare stats', () => {
  const x = [
    7.1, 6.2, 8.0, 5.5, 7.4, 6.8, 7.9, 6.0, 7.2, 6.5, 8.1, 5.9, 7.0, 6.6,
  ];
  const y = [
    3.4, 2.9, 4.1, 2.5, 3.6, 3.1, 4.0, 3.0, 3.2, 3.3, 4.2, 2.7, 3.5, 2.8,
  ];

  test('pearson matches scipy', () =>
    expect(pearson(x, y)).toBeCloseTo(0.9448529633, 9));

  test('spearman uses average ranks for ties (matches scipy)', () =>
    expect(
      spearman(
        [3, 4, 2, 5, 3, 4, 1, 2, 5, 3, 4, 2],
        [2, 4, 2, 5, 3, 3, 1, 1, 4, 3, 5, 2]
      )
    ).toBeCloseTo(0.9087651764, 9));

  test('pearson is null for constant or too-short input', () => {
    expect(pearson([3, 3, 3, 3], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  test.each([
    [2.228138851986, 10, 0.05],
    [2.0, 7.5, 0.0828969952982],
    [0.5, 3.2, 0.649450178013],
    [4.0, 25, 0.000495443670532],
  ])('two-sided t p-value t=%s df=%s', (t, df, p) =>
    expect(tTwoSidedP(t, df)).toBeCloseTo(p, 8)
  );

  test('tCritical95 inverts the p-value', () =>
    expect(tCritical95(10)).toBeCloseTo(2.228138851986, 6));

  test('Fisher range with an effective n', () => {
    const r1 = correlationTest(0.41, 41);
    expect(r1.low).toBeCloseTo(0.1171230711, 8);
    expect(r1.high).toBeCloseTo(0.6372676211, 8);
    const r2 = correlationTest(0.6, 10.5);
    expect(r2.low).toBeCloseTo(-0.0225266654, 8);
    expect(r2.high).toBeCloseTo(0.8872443219, 8);
  });

  test('correlationTest collapses at a perfect correlation', () => {
    expect(correlationTest(1, 20)).toEqual({ p: 0, low: 1, high: 1 });
  });

  test('welch with nEff equal to n matches scipy', () => {
    const g1 = [7.2, 6.8, 7.5, 8.0, 6.9, 7.7, 7.1];
    const g2 = [6.1, 6.5, 5.9, 6.8, 6.0, 6.4, 5.8, 6.3];
    const w = welch(g1, g2, 7, 8);
    expect(w.diff).toBeCloseTo(1.0892857143, 9);
    expect(w.se).toBeCloseTo(0.203821901, 9);
    expect(w.df).toBeCloseTo(11.2481870759, 8);
    expect(w.p).toBeCloseTo(0.0002185646084, 10);
  });

  test('welch widens the error when days resemble each other', () => {
    const g1 = [7.2, 6.8, 7.5, 8.0, 6.9, 7.7, 7.1];
    const g2 = [6.1, 6.5, 5.9, 6.8, 6.0, 6.4, 5.8, 6.3];
    const w = welch(g1, g2, 3.5, 4);
    expect(w.se).toBeCloseTo(0.203821901 * Math.SQRT2, 9);
    expect(w.p).toBeGreaterThan(0.0002185646084);
  });

  test('lag-1 autocorrelation (standard estimator)', () =>
    expect(lag1Autocorrelation([1, 2, 2.5, 2, 3, 3.5, 3, 4])).toBeCloseTo(
      0.3308823529,
      9
    ));

  test('effective n shrinks with autocorrelation, caps at n and floors at 4', () => {
    expect(effectiveN(40, 0.5, 0.5)).toBeCloseTo((40 * 0.75) / 1.25, 9);
    expect(effectiveN(40, -0.3, 0.6)).toBe(40);
    expect(effectiveN(6, 0.99, 0.99)).toBe(4);
  });
});
