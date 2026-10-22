import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { CompareResponse, CompareResult } from '@workspace/shared';

import CompareChart from '../../../src/components/compare/CompareChart';
import { initializeI18n } from '../../../src/localization/i18n';
import type { CompareQuestion } from '../../../src/utils/compareQuestion';

// The global victory-native mock drops CartesianChart's children; render the
// render-prop with plotted points and mark each series as an identifiable View.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
      yKeys,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: Record<string, number | null>[];
      yKeys: string[];
    }) => {
      const arg = ReactModule.useMemo(() => {
        const points: Record<string, unknown[]> = {};
        for (const key of yKeys) {
          points[key] = data.map((d, i) => ({
            x: i,
            xValue: i,
            y: 0,
            yValue: d[key],
          }));
        }
        return { points };
      }, [data, yKeys]);
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children(arg)
      );
    },
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
    Scatter: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'scatter-mark', ...props }),
  };
});

jest.mock('@shopify/react-native-skia', () => ({
  DashPathEffect: () => null,
  matchFont: jest.fn(() => null),
}));

const Q: CompareQuestion = {
  a: 'meditationMinutes',
  b: 'mood',
  choice: 'sameDay',
};

function response(binary?: CompareResult['binary']): CompareResponse {
  return {
    a: {
      key: Q.a,
      values: { '2026-10-01': 10, '2026-10-02': 20, '2026-10-03': 15 },
    },
    b: {
      key: Q.b,
      values: { '2026-10-01': 58, '2026-10-02': 81, '2026-10-03': 70 },
    },
    deviations: {
      a: { '2026-10-01': -5, '2026-10-02': 5, '2026-10-03': 0 },
      b: { '2026-10-01': -12, '2026-10-02': 11, '2026-10-03': 1 },
    },
    result: {
      status: 'ok',
      n: 3,
      needed: 14,
      checks: { ownNormal: true },
      ...(binary ? { binary } : {}),
    },
  } as CompareResponse;
}

describe('CompareChart', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('opens on the dots with a dashed trend line', () => {
    const { getByText, getAllByTestId, getByTestId } = render(
      <CompareChart response={response()} question={Q} />
    );
    expect(getByText('Each day as a dot')).toBeTruthy();
    expect(getByText('Mood vs. your usual')).toBeTruthy();
    expect(getByText('Meditation minutes vs. your usual')).toBeTruthy();
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(getByTestId('line-mark')).toBeTruthy();
  });

  it('switches to the over-time view with display-scale ranges', () => {
    const { getByText, getAllByTestId, queryByTestId } = render(
      <CompareChart response={response()} question={Q} />
    );
    fireEvent.press(getByText('Over time'));
    expect(getAllByTestId('line-mark')).toHaveLength(2);
    expect(queryByTestId('scatter-mark')).toBeNull();
    expect(getByText('Mood 5.8–8.1')).toBeTruthy();
    expect(getByText('Meditation minutes 10.0–20.0')).toBeTruthy();
  });

  it('says each week as a dot in week mode', () => {
    const { getByText } = render(
      <CompareChart
        response={response()}
        question={{ ...Q, choice: 'sameWeek' }}
      />
    );
    expect(getByText('Each week as a dot')).toBeTruthy();
  });

  it('shows the bars instead of dots for a binary result, but still charts over time', () => {
    const binary = {
      yesKey: 'meditated',
      yesMean: 72,
      noMean: 63,
      yesCount: 12,
      noCount: 28,
      diff: 6,
    } as const;
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const { getByTestId, queryByTestId, getByText, queryByText } = render(
      <CompareChart response={response(binary)} question={q} />
    );
    expect(getByText('Days you meditated')).toBeTruthy();
    expect(queryByTestId('scatter-mark')).toBeNull();
    fireEvent.press(getByText('Over time'));
    expect(queryByText('Days you meditated')).toBeNull();
    expect(getByTestId('cartesian-chart')).toBeTruthy();
  });

  it('still draws dots when there is not enough data', () => {
    const r = response();
    r.result = { ...r.result, status: 'not_enough', reason: 'tooFew' };
    const { getAllByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
  });

  it('leaves the trend line out when the dots have no spread to fit', () => {
    const r = response();
    r.deviations.a = {
      '2026-10-01': 0,
      '2026-10-02': 0,
      '2026-10-03': 0,
    };
    const { getAllByTestId, queryByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(queryByTestId('line-mark')).toBeNull();
  });

  it('labels the over-time chart for screen readers', () => {
    const { getByText, getByLabelText } = render(
      <CompareChart response={response()} question={Q} />
    );
    fireEvent.press(getByText('Over time'));
    expect(
      getByLabelText(
        'Meditation minutes and Mood over time, each scaled to its own range'
      )
    ).toBeTruthy();
  });
});
