import React from 'react';
import { render } from '@testing-library/react-native';
import type { CompareResponse, CompareResult } from '@workspace/shared';

import CompareBars from '../../../src/components/compare/CompareBars';
import { initializeI18n } from '../../../src/localization/i18n';
import type { CompareQuestion } from '../../../src/utils/compareQuestion';

const Q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };

function response(binary: CompareResult['binary']): CompareResponse {
  return {
    a: { key: Q.a, values: {} },
    b: { key: Q.b, values: {} },
    deviations: { a: {}, b: {} },
    result: {
      status: 'ok',
      n: 40,
      needed: 5,
      method: 'difference',
      checks: { ownNormal: true },
      binary,
    },
  } as CompareResponse;
}

describe('CompareBars', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows mood means on the 1-10 scale with day counts', () => {
    const { getByText, queryByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 72,
          noMean: 63,
          yesCount: 12,
          noCount: 28,
          diff: 6,
        })}
        question={Q}
      />
    );
    expect(getByText('Days you meditated')).toBeTruthy();
    expect(getByText('Days without meditating')).toBeTruthy();
    expect(getByText('7.2 · 12 days')).toBeTruthy();
    expect(getByText('6.3 · 28 days')).toBeTruthy();
    expect(getByText('+0.6 vs. your usual')).toBeTruthy();
    expect(queryByText(/72/)).toBeNull();
  });

  it('fills the larger mean to 100% and the other in proportion', () => {
    const { getByTestId } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 72,
          noMean: 36,
          yesCount: 12,
          noCount: 28,
          diff: 3,
        })}
        question={Q}
      />
    );
    expect(
      getByTestId('compare-bar-yes', { includeHiddenElements: true }).props
        .style
    ).toEqual({
      width: '100%',
    });
    expect(
      getByTestId('compare-bar-no', { includeHiddenElements: true }).props.style
    ).toEqual({ width: '50%' });
  });

  it('keeps both bars at 0% when both means are 0', () => {
    const { getByTestId, getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 0,
          noMean: 0,
          yesCount: 6,
          noCount: 9,
          diff: 0,
        })}
        question={Q}
      />
    );
    expect(
      getByTestId('compare-bar-yes', { includeHiddenElements: true }).props
        .style
    ).toEqual({ width: '0%' });
    expect(
      getByTestId('compare-bar-no', { includeHiddenElements: true }).props.style
    ).toEqual({ width: '0%' });
    expect(getByText('0.0 vs. your usual')).toBeTruthy();
  });

  it('shows a negative difference with its minus sign', () => {
    const { getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 63,
          noMean: 72,
          yesCount: 12,
          noCount: 28,
          diff: -6,
        })}
        question={Q}
      />
    );
    expect(getByText(/^[-−]0\.6 vs\. your usual$/)).toBeTruthy();
  });

  it('renders nothing without a yes/no result', () => {
    const { toJSON } = render(
      <CompareBars response={response(undefined)} question={Q} />
    );
    expect(toJSON()).toBeNull();
  });
});
