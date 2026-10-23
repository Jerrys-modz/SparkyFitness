import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CompareQuestion, CompareResponse } from '@workspace/shared';
import { CompareDaysTable } from '@/pages/Reports/Compare/CompareDaysTable';
import { CompareTimingTable } from '@/pages/Reports/Compare/CompareTimingTable';
import type { CompareTimingRow } from '@/pages/Reports/Compare/compareTables';

// Every key the sections ask for, so the last test can check
// en/translation.json says the same English.
const defaultsByKey = new Map<string, string>();

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('@/tests/mocks/reactI18next');
  return {
    ...actual,
    useTranslation: () => ({
      ...actual.useTranslation(),
      t: (
        key: string,
        a?: string | Record<string, unknown>,
        b?: Record<string, unknown>
      ) => {
        const def = typeof a === 'string' ? a : a?.['defaultValue'];
        if (typeof def === 'string') defaultsByKey.set(key, def);
        return actual.translateForTest(key, a, b);
      },
    }),
  };
});

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

const DAY_Q: CompareQuestion = {
  a: 'focus',
  b: 'energy',
  choice: 'nextDay',
};

function row(
  choice: CompareTimingRow['choice'],
  timing: CompareTimingRow['timing'],
  over: Partial<CompareTimingRow> = {}
): CompareTimingRow {
  return {
    choice,
    timing,
    status: 'ok',
    strength: 0.4,
    method: 'pearson',
    linked: true,
    isAsked: false,
    ...over,
  };
}

const DAY_ROWS: CompareTimingRow[] = [
  row('dayBefore', -1, { strength: 0.1, linked: false }),
  row('sameDay', 0, { strength: 0.2, linked: false }),
  row('nextDay', 1, { isAsked: true, strength: 0.42 }),
];

describe('CompareTimingTable', () => {
  test('three rows by day, the asked one tagged, with the footnote', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={DAY_ROWS}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText('Does timing matter?')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Energy the day before')).toBeInTheDocument();
    expect(screen.getByText('Energy the next day')).toBeInTheDocument();
    expect(screen.getAllByText('Your question')).toHaveLength(1);
    expect(screen.getByText('+0.42')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getAllByText('No clear link')).toHaveLength(2);
    expect(
      screen.getByText(
        "Looking at several timings makes one 'yes' by chance more likely. Trust the timing you meant to ask about."
      )
    ).toBeInTheDocument();
  });

  test('two rows by week', () => {
    render(
      <CompareTimingTable
        question={{ ...DAY_Q, choice: 'sameWeek' }}
        rows={[
          row('sameWeek', 0, { isAsked: true }),
          row('nextWeek', 1, { linked: false }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Energy the same week')).toBeInTheDocument();
  });

  test('clicking another timing picks it; the asked row does nothing', () => {
    const onPickTiming = jest.fn();
    render(
      <CompareTimingTable
        question={{ ...DAY_Q, choice: 'sameDay' }}
        rows={[
          row('dayBefore', -1),
          row('sameDay', 0, { isAsked: true }),
          row('nextDay', 1),
        ]}
        onPickTiming={onPickTiming}
      />
    );
    fireEvent.click(screen.getByText('Energy the next day'));
    expect(onPickTiming).toHaveBeenCalledWith('nextDay');
    fireEvent.click(screen.getByText('Energy the same day'));
    expect(onPickTiming).toHaveBeenCalledTimes(1);
  });

  test('a failed timing says so while the asked row keeps its strength', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={[
          row('dayBefore', -1, {
            status: 'error',
            strength: null,
            method: null,
            linked: false,
          }),
          row('sameDay', 0, {
            status: 'not_enough',
            strength: null,
            method: null,
            linked: false,
          }),
          row('nextDay', 1, { isAsked: true, strength: 0.42 }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.getByText('Not enough days')).toBeInTheDocument();
    expect(screen.getByText('+0.42')).toBeInTheDocument();
  });

  test('a loading timing shows a spinner', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={[
          row('dayBefore', -1, {
            status: 'loading',
            strength: null,
            method: null,
            linked: false,
          }),
          row('sameDay', 0),
          row('nextDay', 1, { isAsked: true }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('a yes/no difference shows its gap on the outcome scale', () => {
    render(
      <CompareTimingTable
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
        rows={[
          row('dayBefore', -1, { method: 'difference', strength: 0.5 }),
          row('sameDay', 0, {
            isAsked: true,
            method: 'difference',
            strength: -1.25,
          }),
          row('nextDay', 1, { method: 'difference', strength: 0 }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText('+0.5')).toBeInTheDocument();
    expect(screen.getByText('-1.3')).toBeInTheDocument();
  });
});

function response(
  q: CompareQuestion,
  parts: {
    aValues: Record<string, number>;
    bValues: Record<string, number>;
    devA: Record<string, number>;
    devB: Record<string, number>;
  }
): CompareResponse {
  return {
    a: { key: q.a, values: parts.aValues },
    b: { key: q.b, values: parts.bValues },
    through: '2026-10-21',
    deviations: { a: parts.devA, b: parts.devB },
    result: {
      status: 'ok',
      n: 2,
      needed: 14,
      checks: { ownNormal: true },
    },
  };
}

function bodyRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('CompareDaysTable', () => {
  test('shows mood on 1-10 and bedtime as a clock time, newest first', () => {
    const q: CompareQuestion = { a: 'bedtime', b: 'mood', choice: 'nextDay' };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 240, '2026-10-02': 300 },
          bValues: { '2026-10-02': 70, '2026-10-03': 55 },
          devA: { '2026-10-01': 30, '2026-10-02': -30 },
          devB: { '2026-10-02': 10, '2026-10-03': -15 },
        })}
      />
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(within(rows[0]!).getByText('fmt:2026-10-02')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('fmt:2026-10-01')).toBeInTheDocument();
    // Stored mood 70 reads 7.0; the 18:00 + 240 minutes bedtime is 10:00 PM.
    expect(within(rows[1]!).getByText('7.0')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/10:00/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+1.0')).toBeInTheDocument();
    // Headers carry the timing words on B.
    expect(
      within(screen.getByRole('table')).getByText(
        'Mood (the day after you woke)'
      )
    ).toBeInTheDocument();
  });

  test('a yes/no side by day shows Yes/No and a dash for its deviation', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'energy',
      choice: 'sameDay',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 1, '2026-10-02': 0 },
          bValues: { '2026-10-01': 4, '2026-10-02': 3 },
          devA: { '2026-10-01': 1, '2026-10-02': 0 },
          devB: { '2026-10-01': 1, '2026-10-02': -0.5 },
        })}
      />
    );
    const rows = bodyRows();
    expect(within(rows[0]!).getByText('No')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Yes')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('—')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('-0.5')).toBeInTheDocument();
  });

  test('by week the day column reads "Week of"', () => {
    const q: CompareQuestion = {
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sameWeek',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-05': 420 },
          bValues: { '2026-10-05': 3 },
          devA: { '2026-10-05': 10 },
          devB: { '2026-10-05': 0.5 },
        })}
      />
    );
    expect(
      within(screen.getByRole('table')).getByText('Week of fmt:2026-10-05')
    ).toBeInTheDocument();
  });
});

// Runs last, so it sees every key the tests above asked for.
describe('en/translation.json', () => {
  test('says the same English as every default the sections pass', () => {
    const json: unknown = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'public/locales/en/translation.json'),
        'utf-8'
      )
    );
    const leaf = (key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            typeof node === 'object' && node !== null
              ? (node as Record<string, unknown>)[part]
              : undefined,
          json
        );
    const keys = [...defaultsByKey].filter(
      ([k]) =>
        k.startsWith('compareReport.timing.') ||
        k.startsWith('compareReport.days.')
    );
    expect(keys.length).toBeGreaterThan(10);
    const mismatches = keys
      .filter(([key, def]) => leaf(key) !== def)
      .map(([key, def]) => `${key}: ${String(leaf(key))} != ${def}`);
    expect(mismatches).toEqual([]);
  });
});
