import React from 'react';
import { render } from '@testing-library/react-native';
import type { CompareResponse, CompareResult } from '@workspace/shared';

import CompareAnswerCard from '../../../src/components/compare/CompareAnswerCard';
import { initializeI18n } from '../../../src/localization/i18n';
import type { CompareQuestion } from '../../../src/utils/compareQuestion';

const Q: CompareQuestion = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' };

function response(result: Partial<CompareResult>): CompareResponse {
  return {
    a: { key: Q.a, values: {} },
    b: { key: Q.b, values: {} },
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

describe('CompareAnswerCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the headline, detail and stats for an ok result', () => {
    const { getByText } = render(
      <CompareAnswerCard
        response={response({
          method: 'pearson',
          linked: true,
          strength: 'moderate',
          sign: 'positive',
          r: 0.31,
          p: 0.012,
          low: 0.1,
          high: 0.5,
        })}
        question={Q}
        span="90d"
      />
    );
    expect(getByText('Yes, a moderate link')).toBeTruthy();
    expect(getByText(/When last night's time asleep was higher/)).toBeTruthy();
    expect(
      getByText('r 0.31 · 95% range 0.10 to 0.50 · p 0.012 · 62 days')
    ).toBeTruthy();
  });

  it('shows the not-enough headline with no stats line', () => {
    const { getByText, queryByText } = render(
      <CompareAnswerCard
        response={response({ status: 'not_enough', n: 6, reason: 'tooFew' })}
        question={Q}
        span="90d"
      />
    );
    expect(getByText('Not enough days yet')).toBeTruthy();
    expect(queryByText(/95% range/)).toBeNull();
  });

  it('shows a yes/no difference on the 1-10 scale for mood', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const { getByText } = render(
      <CompareAnswerCard
        response={response({
          method: 'difference',
          linked: true,
          p: 0.01,
          low: 3,
          high: 15,
          binary: {
            yesKey: 'meditated',
            yesMean: 72,
            noMean: 63,
            yesCount: 12,
            noCount: 28,
            diff: 9,
          },
        })}
        question={q}
        span="90d"
      />
    );
    expect(
      getByText('difference 0.9 · 95% range 0.3 to 1.5 · p 0.010 · 62 days')
    ).toBeTruthy();
  });
});
