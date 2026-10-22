import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CoachingCheckInResponse } from '@workspace/shared';
import CoachingCheckInCard from '@/pages/Reports/CoachingCheckInCard';
import { renderWithClient } from '../../test-utils';

const mockUseCoachingCheckIn = jest.fn();
const mockAccept = jest.fn();
const mockSaveSettings = jest.fn();

jest.mock('@/hooks/Reports/useReports', () => ({
  useCoachingCheckIn: (userId?: string | null) =>
    mockUseCoachingCheckIn(userId),
}));
jest.mock('@/hooks/Goals/useGoals', () => ({
  useAcceptCoachingCheckInMutation: () => ({
    mutate: mockAccept,
    isPending: false,
  }),
  useSaveCoachingSettingsMutation: () => ({
    mutate: mockSaveSettings,
    isPending: false,
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));
jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
// jsdom has no layout, so the chart container has no size to draw into.
jest.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Pass,
    ComposedChart: ({ data }: { data: unknown[] }) => (
      <div data-testid="coaching-chart" data-points={data.length} />
    ),
    CartesianGrid: Pass,
    XAxis: Pass,
    YAxis: Pass,
    Tooltip: Pass,
    Line: Pass,
    Scatter: Pass,
  };
});

const checkIn = (
  overrides: Partial<CoachingCheckInResponse> = {}
): CoachingCheckInResponse => ({
  asOf: '2026-10-17',
  reason: 'behind',
  dataQuality: {
    windowDays: 28,
    loggedDays: 24,
    excludedDays: 0,
    weighIns: 20,
    outlierWeighIns: 1,
    weighInSpanDays: 27,
    adherence: 0.86,
    missingLoggedDays: 0,
    missingWeighIns: 0,
    missingSpanDays: 0,
    ready: true,
  },
  trend: {
    series: [
      { date: '2026-10-10', weightKg: 80.4, trendKg: 80.2, outlier: false },
      { date: '2026-10-12', weightKg: 84, trendKg: 80.2, outlier: true },
    ],
    currentKg: 80.1,
    weeklyRateKg: -0.1,
  },
  expenditure: {
    kcal: 2300,
    rawKcal: 2310,
    avgIntakeKcal: 2100,
    marginKcal: 120,
    history: [],
  },
  goal: { direction: 'lose', rateKgPerWeek: 0.5, targetWeeklyChangeKg: -0.5 },
  current: { calories: 2000, protein: 150, carbs: 200, fat: 55 },
  suggested: { calories: 1800, protein: 140, carbs: 180, fat: 50 },
  changeKcal: -200,
  limits: ['weekly-cap'],
  proteinFloorApplied: false,
  actionable: true,
  settings: { direction: 'lose', rateKgPerWeek: 0.5, checkInWeekday: 0 },
  goalManagedBySettings: false,
  checkInDue: false,
  ...overrides,
});

const mockData = (data: CoachingCheckInResponse | undefined, state = {}) =>
  mockUseCoachingCheckIn.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...state,
  });

describe('CoachingCheckInCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockData(checkIn());
  });

  it('shows the verdict, the estimate with its uncertainty and both targets', () => {
    renderWithClient(<CoachingCheckInCard userId="u1" />);

    expect(screen.getByText('Behind your goal')).toBeInTheDocument();
    expect(screen.getByText('2,300 kcal a day')).toBeInTheDocument();
    expect(
      screen.getByText('Give or take about 120 kcal from weigh-in noise alone')
    ).toBeInTheDocument();
    expect(screen.getByText('2,000 kcal')).toBeInTheDocument();
    expect(screen.getByText('1,800 kcal')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-chart')).toHaveAttribute(
      'data-points',
      '2'
    );
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
    expect(mockUseCoachingCheckIn).toHaveBeenCalledWith('u1');
  });

  it('accepts the suggested calories', () => {
    renderWithClient(<CoachingCheckInCard userId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(mockAccept).toHaveBeenCalledWith(1800);
  });

  it('offers no Accept or goal editing when viewing someone else’s report', () => {
    renderWithClient(<CoachingCheckInCard userId="u1" readOnly />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByText('Your goal')).toBeNull();
    expect(screen.getByText('1,800 kcal')).toBeInTheDocument();
  });

  it('offers no Accept when Calorie Settings own the calorie target', () => {
    mockData(checkIn({ goalManagedBySettings: true }));
    renderWithClient(<CoachingCheckInCard userId="u1" />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.getByText(/set by Calorie Settings/)).toBeInTheDocument();
  });

  it('lists what is missing instead of a suggestion when data is thin', () => {
    mockData(
      checkIn({
        reason: 'insufficient-data',
        suggested: null,
        actionable: false,
        changeKcal: 0,
        limits: [],
        expenditure: {
          kcal: null,
          rawKcal: null,
          avgIntakeKcal: null,
          marginKcal: null,
          history: [],
        },
        dataQuality: {
          ...checkIn().dataQuality,
          ready: false,
          missingLoggedDays: 3,
          missingWeighIns: 1,
          outlierWeighIns: 0,
        },
      })
    );
    renderWithClient(<CoachingCheckInCard userId="u1" />);

    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
    expect(
      screen.getByText('Log 3 more days for a reliable estimate')
    ).toBeInTheDocument();
    expect(screen.getByText('Weigh in 1 more time')).toBeInTheDocument();
    expect(
      screen.getByText('Not enough data to estimate yet.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Suggested')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('saves the goal direction, rate and check-in day', () => {
    renderWithClient(<CoachingCheckInCard userId="u1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Gain' }));
    expect(mockSaveSettings).toHaveBeenCalledWith({ direction: 'gain' });

    fireEvent.click(screen.getByRole('button', { name: '0.25 kg' }));
    expect(mockSaveSettings).toHaveBeenCalledWith({ rateKgPerWeek: 0.25 });

    fireEvent.click(
      screen.getByRole('button', {
        name: new Date(2024, 0, 10).toLocaleDateString(undefined, {
          weekday: 'short',
        }),
      })
    );
    expect(mockSaveSettings).toHaveBeenCalledWith({ checkInWeekday: 3 });
  });

  it('hides the rate for a maintain goal', () => {
    mockData(
      checkIn({
        settings: {
          direction: 'maintain',
          rateKgPerWeek: 0,
          checkInWeekday: 0,
        },
      })
    );
    renderWithClient(<CoachingCheckInCard userId="u1" />);
    expect(screen.queryByText('Rate per week')).toBeNull();
  });

  it('renders nothing when the check-in failed to load', () => {
    mockData(undefined, { isError: true });
    const { container } = renderWithClient(<CoachingCheckInCard userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
