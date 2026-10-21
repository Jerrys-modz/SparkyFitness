import { describe, expect, test } from 'vitest';
import {
  addDays,
  analyzeDays,
  COMPARE_METRIC_KEYS,
  COMPARE_METRICS,
  dayOfWeek,
  deviationsFromOwnNormal,
  lag1Autocorrelation,
  pearson,
  type CompareMetricDef,
  type DaySeries,
} from '@workspace/shared';

// Seeded generator so the synthetic data is identical on every run.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal draws (Box-Muller) from a seeded uniform source.
function normal(seed: number): () => number {
  const uniform = mulberry32(seed);
  return () =>
    Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

const START = '2026-03-02';
const END = addDays(START, 59); // a 60-day window
const FIRST = addDays(START, -21); // history for the own normal

function daysFrom(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

const WINDOW = daysFrom(START, 60);
const ALL_DAYS = daysFrom(FIRST, 83); // FIRST .. END + 1

/** A series over FIRST..END+1; `f` gets the day's index from FIRST and the day. */
function build(f: (i: number, day: string) => number | undefined): DaySeries {
  const out: DaySeries = {};
  ALL_DAYS.forEach((day, i) => {
    const value = f(i, day);
    if (value !== undefined) out[day] = value;
  });
  return out;
}

/** B's value on a day is A's value the day before, plus noise. */
function nextDayOf(a: DaySeries, noise: () => number): DaySeries {
  return build((_, day) => {
    const previous = a[addDays(day, -1)];
    return previous === undefined ? undefined : previous + noise();
  });
}

const isWeekend = (day: string) => [0, 6].includes(dayOfWeek(day));

describe('compare metric catalog', () => {
  test('metric catalog follows the kind, missing and weekly rules', () => {
    const keysWhere = (pick: (def: CompareMetricDef) => boolean) =>
      COMPARE_METRIC_KEYS.filter((key) => pick(COMPARE_METRICS[key]));

    for (const key of COMPARE_METRIC_KEYS) {
      expect(COMPARE_METRICS[key].key).toBe(key);
    }
    expect(keysWhere((m) => m.kind === 'ordinal')).toEqual(['energy', 'focus']);
    expect(keysWhere((m) => m.kind === 'binary')).toEqual(['meditated']);
    expect(keysWhere((m) => m.missing === 'event')).toEqual([
      'meditationMinutes',
      'meditationSessions7d',
      'meditated',
      'workoutMinutes',
      'cardioMinutes',
      'strengthVolume',
      'trainingLoad',
    ]);
    expect(keysWhere((m) => m.missing === 'food')).toEqual([
      'calories',
      'protein',
      'carbs',
      'fat',
      'caffeine',
      'alcohol',
    ]);
    expect(keysWhere((m) => m.weekly === 'sum')).toEqual([
      'meditationMinutes',
      'workoutMinutes',
      'cardioMinutes',
      'strengthVolume',
      'trainingLoad',
    ]);
    expect(keysWhere((m) => m.weekly === 'daysYes')).toEqual(['meditated']);
    expect(keysWhere((m) => m.weekly === null)).toEqual([
      'meditationSessions7d',
    ]);
    expect(COMPARE_METRICS.bedtime.unit).toBe('min-after-18:00');
    expect(COMPARE_METRICS.mood.unit).toBe('10-100');
    expect(COMPARE_METRICS.caffeine.unit).toBe('mg');
  });
});

describe('compare day analysis', () => {
  test('deviationsFromOwnNormal subtracts the mean of the previous 14 days and drops days with fewer than 7', () => {
    const d = '2026-04-20';
    const series: DaySeries = { [addDays(d, -15)]: 100, [d]: 8 }; // d-15 is outside the window
    const prior = [1, 9, 2, 8, 3, 7, 4, 6, 5, 5]; // mean 5
    [-14, -13, -11, -10, -8, -7, -5, -4, -2, -1].forEach((offset, i) => {
      series[addDays(d, offset)] = prior[i];
    });

    const sparse = '2026-06-10'; // only 6 earlier values
    series[sparse] = 20;
    for (let i = 1; i <= 6; i++) series[addDays(sparse, -i)] = 4;

    const seven = '2026-08-10'; // exactly 7 earlier values
    series[seven] = 10;
    for (let i = 1; i <= 7; i++) series[addDays(seven, -2 * i)] = 4;

    const unlogged = '2026-09-01';

    expect(
      deviationsFromOwnNormal(series, [d, sparse, seven, unlogged])
    ).toEqual({ [d]: 3, [seven]: 6 });
  });

  test('analyzeDays is not_enough with n 0 when the two series share no days', () => {
    const noise = normal(1);
    const even = build((i) => (i % 2 === 0 ? 60 + 10 * noise() : undefined));
    const odd = build((i) => (i % 2 === 1 ? 70 + 5 * noise() : undefined));
    const expected = {
      status: 'not_enough',
      n: 0,
      needed: 14,
      checks: { ownNormal: true },
    };

    expect(
      analyzeDays({
        a: { key: 'mood', values: even },
        b: { key: 'sleepScore', values: odd },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual(expected);
    expect(
      analyzeDays({
        a: { key: 'timeAsleep', values: {} },
        b: { key: 'mood', values: even },
        timing: 1,
        start: START,
        end: END,
      })
    ).toEqual(expected);
  });

  test('analyzeDays is not_enough when one side never varies', () => {
    const noise = normal(2);
    const mood = build(() => 60 + 10 * noise());
    const energy = build(() => 3);
    const meditated = build((i) => i % 2);

    expect(
      analyzeDays({
        a: { key: 'mood', values: mood },
        b: { key: 'energy', values: energy },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual({
      status: 'not_enough',
      n: 60,
      needed: 14,
      checks: { ownNormal: true },
    });
    expect(
      analyzeDays({
        a: { key: 'meditated', values: meditated },
        b: { key: 'energy', values: energy },
        timing: 0,
        start: START,
        end: END,
      }).status
    ).toBe('not_enough');
  });

  test('analyzeDays links two series that move together and says positive', () => {
    const noise = normal(3);
    const a = build(() => 60 + 10 * noise());
    const b = build((_, day) => a[day] + 2 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result).toMatchObject({
      status: 'ok',
      n: 60,
      method: 'pearson',
      linked: true,
      sign: 'positive',
      strength: 'strong',
    });
    expect(result.low).toBeGreaterThan(0);
    expect(result.checks.direction).toBeDefined();
    expect(result.checks.weekend).toBe('holds');
  });

  test('analyzeDays uses spearman when a side is ordinal', () => {
    const noise = normal(4);
    const mood = build(() => 60 + 10 * noise());
    const energy = build((_, day) =>
      Math.min(
        5,
        Math.max(1, Math.round(3 + (mood[day] - 60) / 10 + 0.5 * noise()))
      )
    );
    expect(new Set(WINDOW.map((day) => energy[day]))).toEqual(
      new Set([1, 2, 3, 4, 5])
    );

    const result = analyzeDays({
      a: { key: 'mood', values: mood },
      b: { key: 'energy', values: energy },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.status).toBe('ok');
    expect(result.method).toBe('spearman');
  });

  test('analyzeDays pairs B on the next day for timing 1', () => {
    const noise = normal(5);
    const a = build(() => 60 + 10 * noise());
    const b = nextDayOf(a, () => 2 * noise());
    const ask = (timing: -1 | 0 | 1) =>
      analyzeDays({
        a: { key: 'caffeine', values: a },
        b: { key: 'timeAsleep', values: b },
        timing,
        start: START,
        end: END,
      });

    expect(ask(1).linked).toBe(true);
    expect(ask(0).linked).toBe(false);
  });

  test('analyzeDays pairs B on the day before for timing -1', () => {
    const noise = normal(5);
    const first = build(() => 60 + 10 * noise());
    const second = nextDayOf(first, () => 2 * noise());
    const ask = (timing: -1 | 0 | 1) =>
      analyzeDays({
        a: { key: 'timeAsleep', values: second },
        b: { key: 'caffeine', values: first },
        timing,
        start: START,
        end: END,
      });

    expect(ask(-1).linked).toBe(true);
    expect(ask(0).linked).toBe(false);
  });

  test('a shared slow drift is not a link once compared with the own normal', () => {
    const noise = normal(6);
    const a = build((i) => 40 + 0.5 * i + noise());
    const b = build((i) => 50 + 0.4 * i + noise());

    const rawR = pearson(
      WINDOW.map((day) => a[day]),
      WINDOW.map((day) => b[day])
    );
    expect(rawR).toBeGreaterThan(0.9);

    const result = analyzeDays({
      a: { key: 'weightTrend', values: a },
      b: { key: 'restingHeartRate', values: b },
      timing: 0,
      start: START,
      end: END,
    });
    expect(result.status).toBe('ok');
    expect(result.linked).toBe(false);
  });

  /** Meditated on `yesDays` of the 45 days from START, mood 8 higher on those days. */
  function meditationData(yesDays: number, seed: number) {
    const uniform = mulberry32(seed);
    const noise = normal(seed + 1);
    const window = daysFrom(START, 45);
    const shuffled = [...window];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(uniform() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const yes = new Set(shuffled.slice(0, yesDays));
    const meditated: DaySeries = {};
    for (const day of window) meditated[day] = yes.has(day) ? 1 : 0;
    const mood = build((_, day) => 60 + (yes.has(day) ? 8 : 0) + 3 * noise());
    return { meditated, mood, end: window[window.length - 1] };
  }

  test('binary side compares averages', () => {
    const { meditated, mood, end } = meditationData(20, 7);

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end,
    });

    expect(result).toMatchObject({
      status: 'ok',
      n: 45,
      method: 'difference',
      linked: true,
      sign: 'positive',
      binary: { yesKey: 'meditated', yesCount: 20, noCount: 25 },
    });
    expect(result.r).toBeUndefined();
    expect(result.strength).toBeUndefined();
    expect(result.low).toBeGreaterThan(0);
    // The bars show raw mood on each kind of day: about 8 apart.
    const gap = result.binary
      ? result.binary.yesMean - result.binary.noMean
      : NaN;
    expect(gap).toBeGreaterThan(6);
    expect(gap).toBeLessThan(10);
    expect(result.checks).toEqual({ ownNormal: true });
  });

  test('binary side is not_enough with fewer than 5 days in a group', () => {
    const { meditated, mood, end } = meditationData(4, 8);

    expect(
      analyzeDays({
        a: { key: 'mood', values: mood },
        b: { key: 'meditated', values: meditated },
        timing: 0,
        start: START,
        end,
      })
    ).toEqual({
      status: 'not_enough',
      n: 4,
      needed: 5,
      checks: { ownNormal: true },
    });
  });

  test('binary side shrinks each group by its own lag-1 autocorrelation', () => {
    const noise = normal(13);
    // Mood moves in slow waves, so neighbouring days resemble each other.
    const mood = build((i) => 60 + 5 * Math.sin(i / 2) + 3 * noise());
    const meditated: DaySeries = {};
    WINDOW.forEach((day, i) => {
      meditated[day] = Math.floor(i / 5) % 2; // runs of 5 days
    });

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end: END,
    });

    // Each group's n(1 - ρ)/(1 + ρ), ρ from its deviations in day order.
    const deviations = deviationsFromOwnNormal(mood, WINDOW);
    const shrunk = (flag: number) => {
      const xs = WINDOW.filter((day) => meditated[day] === flag).map(
        (day) => deviations[day]
      );
      const rho = Math.max(0, lag1Autocorrelation(xs));
      return (xs.length * (1 - rho)) / (1 + rho);
    };
    expect(result.method).toBe('difference');
    expect(result.nEff).toBeCloseTo(shrunk(1) + shrunk(0), 6);
    expect(result.nEff).toBeLessThan(result.n / 2);
  });

  test('direction check names the first thing when the mirrored pairing is not linked', () => {
    const noise = normal(9);
    const a = build(() => 60 + 10 * noise());
    const b = nextDayOf(a, () => 3 * noise());

    const result = analyzeDays({
      a: { key: 'trainingLoad', values: a },
      b: { key: 'overnightHrv', values: b },
      timing: 1,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('firstComesFirst');
  });

  test('direction check says the link is stronger the other way round when the mirrored pairing is stronger', () => {
    const noise = normal(10);
    const b = build(() => 60 + 10 * noise());
    // A depends a little on B the same day and a lot on B the day before.
    const a = build((_, day) => {
      const before = b[addDays(day, -1)];
      return before === undefined
        ? undefined
        : b[day] + 2 * before + 5 * noise();
    });

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('strongerOtherWay');
  });

  test('weekend check flags a link that only weekends explain', () => {
    const noise = normal(11);
    const a = build((_, day) => 50 + (isWeekend(day) ? 10 : 0) + noise());
    const b = build((_, day) => 70 + (isWeekend(day) ? 10 : 0) + noise());

    const result = analyzeDays({
      a: { key: 'alcohol', values: a },
      b: { key: 'restingHeartRate', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.weekend).toBe('mayBeWeekends');
  });

  test('no checks unless linked', () => {
    const noise = normal(12);
    const a = build(() => 60 + 10 * noise());
    const b = build(() => 70 + 5 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'steps', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.status).toBe('ok');
    expect(result.linked).toBe(false);
    expect(result.strength).toBeUndefined();
    expect(result.sign).toBeUndefined();
    expect(result.checks).toEqual({ ownNormal: true });
  });
});
