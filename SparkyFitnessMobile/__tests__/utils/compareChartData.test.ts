import type { CompareResponse } from '@workspace/shared';

import {
  displayDots,
  overTimeData,
  pairedDots,
  scaledSeries,
  trendLine,
} from '../../src/utils/compareChartData';

function response(
  devA: Record<string, number>,
  devB: Record<string, number>,
  valuesA: Record<string, number> = {},
  valuesB: Record<string, number> = {}
): CompareResponse {
  return {
    a: { key: 'meditationMinutes', values: valuesA },
    b: { key: 'mood', values: valuesB },
    through: '2026-10-21',
    deviations: { a: devA, b: devB },
    result: { status: 'ok', n: 1, needed: 14, checks: { ownNormal: true } },
  } as CompareResponse;
}

describe('pairedDots', () => {
  it('pairs A with B one day later in day mode, timing 1', () => {
    const dots = pairedDots(
      response({ '2026-10-01': 5 }, { '2026-10-01': 99, '2026-10-02': 7 }),
      'day',
      1
    );
    expect(dots).toEqual([{ key: '2026-10-01', x: 5, y: 7 }]);
  });

  it('pairs A with B the day before at timing -1', () => {
    const dots = pairedDots(
      response({ '2026-10-02': 5 }, { '2026-10-01': 3 }),
      'day',
      -1
    );
    expect(dots).toEqual([{ key: '2026-10-02', x: 5, y: 3 }]);
  });

  it('pairs a week with B seven days later in week mode, timing 1', () => {
    const dots = pairedDots(
      response({ '2026-09-07': 2 }, { '2026-09-08': 111, '2026-09-14': 4 }),
      'week',
      1
    );
    expect(dots).toEqual([{ key: '2026-09-07', x: 2, y: 4 }]);
  });

  it('drops keys missing on either side and sorts by key', () => {
    const dots = pairedDots(
      response(
        { '2026-10-03': 3, '2026-10-01': 1, '2026-10-02': 2 },
        { '2026-10-01': 10, '2026-10-03': 30 }
      ),
      'day',
      0
    );
    expect(dots).toEqual([
      { key: '2026-10-01', x: 1, y: 10 },
      { key: '2026-10-03', x: 3, y: 30 },
    ]);
  });
});

describe('trendLine', () => {
  it('fits y = 2x + 1', () => {
    const line = trendLine([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(line?.slope).toBeCloseTo(2);
    expect(line?.intercept).toBeCloseTo(1);
  });

  it('returns null for one point or no x spread', () => {
    expect(trendLine([{ x: 1, y: 1 }])).toBeNull();
    expect(
      trendLine([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ])
    ).toBeNull();
  });
});

describe('scaledSeries', () => {
  it('scales min-max to 0-1 over its own values', () => {
    const out = scaledSeries({ a: 60, b: 80, c: 70 }, ['a', 'b', 'c']);
    expect(out.map((p) => p.scaled)).toEqual([0, 1, 0.5]);
    expect(out.map((p) => p.raw)).toEqual([60, 80, 70]);
  });

  it('puts a constant series at 0.5', () => {
    const out = scaledSeries({ a: 4, b: 4 }, ['a', 'b']);
    expect(out.map((p) => p.scaled)).toEqual([0.5, 0.5]);
  });

  it('gives null for a gap', () => {
    const out = scaledSeries({ a: 1, c: 3 }, ['a', 'b', 'c']);
    expect(out[1]).toEqual({ key: 'b', scaled: null, raw: null });
  });
});

describe('overTimeData', () => {
  it('uses the union of keys in date order with each side own range', () => {
    const data = overTimeData(
      response(
        {},
        {},
        { '2026-10-02': 10, '2026-10-01': 30 },
        {
          '2026-10-02': 60,
          '2026-10-03': 80,
        }
      )
    );
    expect(data.rows.map((r) => r.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(data.rows.map((r) => r.a)).toEqual([1, 0, null]);
    expect(data.rows.map((r) => r.b)).toEqual([null, 0, 1]);
    expect(data.aRange).toEqual({ min: 10, max: 30 });
    expect(data.bRange).toEqual({ min: 60, max: 80 });
  });

  it('has null ranges when a side has no values', () => {
    const data = overTimeData(response({}, {}));
    expect(data.rows).toEqual([]);
    expect(data.aRange).toBeNull();
  });
});

describe('displayDots', () => {
  it('shows mood on the 1-10 scale and leaves other metrics alone', () => {
    const dots = [{ key: '2026-10-01', x: 20, y: 30 }];
    expect(displayDots(dots, { a: 'mood', b: 'energy' })).toEqual([
      { key: '2026-10-01', x: 2, y: 30 },
    ]);
    expect(displayDots(dots, { a: 'energy', b: 'mood' })).toEqual([
      { key: '2026-10-01', x: 20, y: 3 },
    ]);
  });
});
