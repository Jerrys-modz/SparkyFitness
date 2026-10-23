import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CompareResponse } from '@workspace/shared';
import { SUGGESTED_QUESTIONS } from '@workspace/shared';
import { CompareReport } from '@/pages/Reports/Compare/CompareReport';
import { renderWithClient } from '@/tests/test-utils';

const mockGetCompare = jest.fn();
let mockActingOnBehalf = false;

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

// The real hooks run; only the network call and the signed-in user are stubbed,
// so "no request fires" is read straight off getCompare.
jest.mock('@/api/Reports/compareApi', () => ({
  ...jest.requireActual('@/api/Reports/compareApi'),
  getCompare: (q: unknown) => mockGetCompare(q),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: 'user-1' } }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

jest.mock('@/pages/Reports/Compare/CompareAnswerCard', () => ({
  CompareAnswerCard: () => <div data-testid="answer-card" />,
}));
jest.mock('@/pages/Reports/Compare/CompareHowSure', () => ({
  CompareHowSure: () => <div data-testid="how-sure" />,
}));
jest.mock('@/pages/Reports/Compare/CompareChecks', () => ({
  CompareChecks: () => <div data-testid="checks" />,
}));
jest.mock('@/pages/Reports/Compare/CompareDotsChart', () => ({
  CompareDotsChart: () => <div data-testid="dots-chart" />,
}));
jest.mock('@/pages/Reports/Compare/CompareOverTimeChart', () => ({
  CompareOverTimeChart: () => <div data-testid="over-time-chart" />,
}));
jest.mock('@/pages/Reports/Compare/CompareTimingTable', () => ({
  CompareTimingTable: () => <div data-testid="timing-table" />,
}));
jest.mock('@/pages/Reports/Compare/CompareDaysTable', () => ({
  CompareDaysTable: () => <div data-testid="days-table" />,
}));

const RESPONSE = {
  through: '2026-10-21',
  result: { status: 'ok' },
} as unknown as CompareResponse;

describe('CompareReport', () => {
  beforeEach(() => {
    mockActingOnBehalf = false;
    window.localStorage.clear();
    mockGetCompare.mockReset();
    mockGetCompare.mockResolvedValue(RESPONSE);
  });

  const suggestionId = () => {
    const first = SUGGESTED_QUESTIONS[0]!;
    return `compare-suggestion-${first.a}-${first.b}-${first.choice}`;
  };

  it('shows suggested questions and asks nothing before a question is picked', () => {
    renderWithClient(<CompareReport />);
    expect(screen.getByTestId(suggestionId())).toBeInTheDocument();
    expect(mockGetCompare).not.toHaveBeenCalled();
    expect(screen.queryByTestId('answer-card')).not.toBeInTheDocument();
  });

  it('renders the answer column, both charts and both tables for a picked question', async () => {
    renderWithClient(<CompareReport />);
    fireEvent.click(screen.getByTestId(suggestionId()));
    for (const id of [
      'answer-card',
      'how-sure',
      'checks',
      'dots-chart',
      'over-time-chart',
      'timing-table',
      'days-table',
    ]) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
    const first = SUGGESTED_QUESTIONS[0]!;
    expect(mockGetCompare).toHaveBeenCalledWith(
      expect.objectContaining({ a: first.a, b: first.b })
    );
    // The first answer is kept as a recent question.
    expect(
      window.localStorage.getItem('sparky.compareRecentQuestions.v1')
    ).toContain(first.choice);
  });

  it('shows only-your-own-data and sends no request when acting on behalf', () => {
    mockActingOnBehalf = true;
    renderWithClient(<CompareReport />);
    expect(
      screen.getByText('Compare shows only your own data')
    ).toBeInTheDocument();
    expect(mockGetCompare).not.toHaveBeenCalled();
  });
});
