import type { CompareResponse, CompareResult } from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  metricPhrase,
  sentenceText,
  statsLine,
  timingPhrase,
  verdictCopy,
} from '../../src/utils/compareCopy';
import {
  SUGGESTED_QUESTIONS,
  type CompareQuestion,
} from '../../src/utils/compareQuestion';

const t = ((key: string, options: Record<string, unknown>) =>
  i18n.t(key, options)) as never;

beforeAll(async () => {
  await initializeI18n('en');
  await i18n.changeLanguage('en');
});

const DAY_Q: CompareQuestion = {
  a: 'timeAsleep',
  b: 'energy',
  choice: 'sameDay',
};

function values(count: number, fill: (i: number) => number = (i) => i) {
  const out: Record<string, number> = {};
  for (let i = 0; i < count; i += 1) {
    out[`2026-09-${String((i % 28) + 1).padStart(2, '0')}-${i}`] = fill(i);
  }
  return out;
}

function response(
  result: Partial<CompareResult>,
  q: CompareQuestion = DAY_Q,
  a: Record<string, number> = values(20),
  b: Record<string, number> = values(20)
): CompareResponse {
  return {
    a: { key: q.a, values: a },
    b: { key: q.b, values: b },
    deviations: { a: {}, b: {} },
    result: {
      status: 'ok',
      n: 62,
      needed: 14,
      checks: { ownNormal: true },
      ...result,
    },
  } as CompareResponse;
}

const ALL: string[] = [];
function collect(copy: { headline: string; detail: string }) {
  ALL.push(copy.headline, copy.detail);
  return copy;
}

afterAll(() => {
  for (const s of ALL) expect(s.toLowerCase()).not.toMatch(/\bcause/);
});

describe('phrases', () => {
  test('metricPhrase', () => {
    expect(metricPhrase('timeAsleep', t)).toBe("last night's time asleep");
    expect(metricPhrase('overnightHrv', t)).toMatch(/^last night's/);
    expect(metricPhrase('energy', t)).toBe('energy');
    expect(metricPhrase('calories', t)).toBe('calories');
  });

  test('timingPhrase', () => {
    expect(
      timingPhrase({ a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' }, t)
    ).toBe('that night');
    expect(timingPhrase(DAY_Q, t)).toBe('that day');
    expect(
      timingPhrase({ a: 'calories', b: 'energy', choice: 'sameDay' }, t)
    ).toBe('the same day');
    expect(
      timingPhrase({ a: 'calories', b: 'energy', choice: 'nextDay' }, t)
    ).toBe('the next day');
    expect(
      timingPhrase({ a: 'calories', b: 'energy', choice: 'dayBefore' }, t)
    ).toBe('the day before');
    expect(
      timingPhrase({ a: 'calories', b: 'energy', choice: 'sameWeek' }, t)
    ).toBe('the same week');
    expect(
      timingPhrase({ a: 'calories', b: 'energy', choice: 'nextWeek' }, t)
    ).toBe('the next week');
  });

  test('sentenceText', () => {
    expect(sentenceText(DAY_Q, t)).toBe(
      "Does last night's time asleep go with energy that day?"
    );
  });
});

describe('suggested questions read naturally', () => {
  test.each([
    [0, "Does last night's time asleep go with energy that day?"],
    [1, 'Does meditating go with mood the same day?'],
    [2, 'Does caffeine go with time asleep that night?'],
    [3, 'Does training load go with overnight HRV that night?'],
  ])('question %i', (i, text) => {
    expect(sentenceText(SUGGESTED_QUESTIONS[i], t)).toBe(text);
  });
});

describe('verdictCopy', () => {
  test('difference path hint wording', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const binary = {
      yesKey: 'meditated' as const,
      yesMean: 5,
      noMean: 1,
      yesCount: 9,
      noCount: 30,
      diff: 4,
    };
    const c = verdictCopy(
      response({ method: 'difference', linked: false, binary }, q),
      q,
      '30d',
      t
    );
    expect(c.detail).toContain(
      'A longer span makes a small difference easier to see.'
    );
    expect(c.detail).not.toContain('weak link');
  });

  test('linked positive', () => {
    const c = collect(
      verdictCopy(
        response({ linked: true, strength: 'moderate', sign: 'positive' }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Yes, a moderate link');
    expect(c.detail).toBe(
      "When last night's time asleep was higher than usual, your energy that day was higher than usual too."
    );
  });

  test('linked negative', () => {
    const c = collect(
      verdictCopy(
        response({ linked: true, strength: 'weak', sign: 'negative' }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Yes, a weak link');
    expect(c.detail).toContain('your energy that day was lower than usual.');
  });

  test('not linked with the longer-span hint', () => {
    const c = collect(
      verdictCopy(response({ linked: false }), DAY_Q, '30d', t)
    );
    expect(c.headline).toBe('No clear link');
    expect(c.detail).toContain(
      "Over these 62 days, they didn't move together more than chance would explain."
    );
    expect(c.detail).toContain(
      'A longer span makes a weak link easier to see.'
    );
  });

  test('not linked without the hint on the longest or custom span', () => {
    for (const span of ['90d', 'custom'] as const) {
      const c = collect(
        verdictCopy(response({ linked: false }), DAY_Q, span, t)
      );
      expect(c.detail).not.toContain('longer span');
    }
    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    const week = collect(
      verdictCopy(response({ linked: false, n: 20 }, weekQ), weekQ, '1y', t)
    );
    expect(week.detail).toContain('Over these 20 weeks');
    expect(week.detail).not.toContain('longer span');
    expect(
      verdictCopy(response({ linked: false }, weekQ), weekQ, '6m', t).detail
    ).toContain('longer span');
  });

  test('binary linked and not linked', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const binary = {
      yesKey: 'meditated' as const,
      yesMean: 5,
      noMean: 1,
      yesCount: 9,
      noCount: 30,
      diff: 4,
    };
    const up = collect(
      verdictCopy(
        response({ method: 'difference', linked: true, binary }, q),
        q,
        '90d',
        t
      )
    );
    expect(up.headline).toBe('Yes, a difference');
    expect(up.detail).toBe(
      'On days you meditated, your mood was higher than usual.'
    );
    const down = collect(
      verdictCopy(
        response(
          {
            method: 'difference',
            linked: true,
            binary: { ...binary, diff: -4 },
          },
          q
        ),
        q,
        '90d',
        t
      )
    );
    expect(down.detail).toContain('lower than usual');
    const none = collect(
      verdictCopy(
        response({ method: 'difference', linked: false, binary }, q),
        q,
        '90d',
        t
      )
    );
    expect(none.headline).toBe('No clear difference');
  });

  test('too few in day and week modes', () => {
    const day = collect(
      verdictCopy(
        response(
          {
            status: 'not_enough',
            reason: 'tooFew',
            n: 9,
            needed: 14,
          },
          DAY_Q,
          values(10),
          values(10)
        ),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(day.headline).toBe('Not enough days yet');
    expect(day.detail).toContain('You have 9 days; an answer needs 14 days.');
    expect(day.detail).toContain(
      'Log time asleep on 5 more days, or pick a longer span.'
    );
    expect(day.detail).not.toContain('previous two weeks');

    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    const week = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'tooFew', n: 3, needed: 8 },
          weekQ
        ),
        weekQ,
        '6m',
        t
      )
    );
    expect(week.headline).toBe('Not enough weeks yet');
    expect(week.detail).toContain('You have 3 weeks; an answer needs 8 weeks.');
  });

  test('the weaker side is the one with fewer values', () => {
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 9, needed: 14 },
        DAY_Q,
        values(30),
        values(10)
      ),
      DAY_Q,
      '90d',
      t
    );
    expect(c.detail).toContain('Log energy on 5 more days');
  });

  test('explains the own-normal history when many days are logged', () => {
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 3, needed: 14 },
        DAY_Q,
        values(40),
        values(40)
      ),
      DAY_Q,
      '90d',
      t
    );
    expect(c.detail).toContain(
      'Each day is compared with your previous two weeks, so a day needs a week of history first.'
    );
  });

  test('fewYes and fewNo name the yes/no metric', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const few = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'fewYes', n: 2, needed: 5 },
          q
        ),
        q,
        '90d',
        t
      )
    );
    expect(few.headline).toBe('Not enough days when you meditated yet');
    expect(few.detail).toBe(
      'You have 2 days; an answer needs 5 days. Try a longer span.'
    );
    const no = collect(
      verdictCopy(
        response({ status: 'not_enough', reason: 'fewNo', n: 1, needed: 5 }, q),
        q,
        '90d',
        t
      )
    );
    expect(no.headline).toBe('Not enough days without meditating yet');
    expect(no.detail).toBe(
      "You meditated on almost every day here, so there's nothing to compare against. Try a longer span."
    );
  });

  test('no variation names what did not change and never asks for more days', () => {
    const c = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'noVariation', n: 0 },
          DAY_Q,
          values(20, () => 3),
          values(20)
        ),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Nothing to compare yet');
    expect(c.detail).toBe(
      "Time asleep was the same every time over this span, so there's nothing to compare it with."
    );
    const generic = collect(
      verdictCopy(
        response({ status: 'not_enough', reason: 'noVariation', n: 0 }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(generic.detail).toBe("One of these didn't change over this span.");
    expect(c.detail.toLowerCase()).not.toContain('more days');
    expect(generic.detail.toLowerCase()).not.toContain('more days');
  });
});

describe('statsLine', () => {
  const base: CompareResult = {
    status: 'ok',
    n: 62,
    needed: 14,
    method: 'pearson',
    r: 0.41,
    low: 0.12,
    high: 0.64,
    p: 0.012,
    checks: { ownNormal: true },
  };

  test('correlation', () => {
    expect(statsLine(base, 'day', t)).toBe(
      'r 0.41 · 95% range 0.12 to 0.64 · p 0.012 · 62 days'
    );
  });

  test('tiny p', () => {
    expect(statsLine({ ...base, p: 0.0004 }, 'day', t)).toContain('p < 0.001');
  });

  test('week mode counts weeks', () => {
    expect(statsLine({ ...base, n: 20 }, 'week', t)).toContain('20 weeks');
  });

  test('not enough is null', () => {
    expect(
      statsLine({ ...base, status: 'not_enough', reason: 'tooFew' }, 'day', t)
    ).toBeNull();
  });

  test('difference shows mood on the 1-10 scale', () => {
    const line = statsLine(
      {
        ...base,
        method: 'difference',
        r: undefined,
        low: 2,
        high: 16,
        binary: {
          yesKey: 'meditated',
          yesMean: 60,
          noMean: 50,
          yesCount: 9,
          noCount: 30,
          diff: 9.4,
        },
      },
      'day',
      t,
      'mood'
    );
    expect(line).toBe(
      'difference 0.9 · 95% range 0.2 to 1.6 · p 0.012 · 62 days'
    );
  });
});
