import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Vo2MaxTrendCard from '@/pages/Reports/Vo2MaxTrendCard';
import { vo2MaxPoints } from '@/pages/Reports/vo2MaxTrend';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: string | { defaultValue?: string; age?: number }
    ) => {
      if (typeof options === 'string') return options;
      return (options?.defaultValue ?? key).replace(
        '{{age}}',
        String(options?.age ?? '')
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

jest.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Stub,
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    CartesianGrid: Stub,
    Tooltip: Stub,
  };
});

const metrics = [
  { entry_date: '2026-09-01', vo2_max: 44 },
  { entry_date: '2026-10-01', vo2_max: null },
  { entry_date: '2026-11-20', vo2_max: 46.5 },
];

describe('vo2MaxPoints', () => {
  it('keeps one point per day, averages sources and drops empty rows', () => {
    expect(
      vo2MaxPoints([
        { entry_date: '2026-11-20', vo2_max: 47 },
        { entry_date: '2026-11-20', vo2_max: 46 },
        { entry_date: '2026-09-01', vo2_max: 44 },
        { entry_date: '2026-10-01', vo2_max: null },
        { entry_date: '2026-10-02', vo2_max: 0 },
      ])
    ).toEqual([
      { date: '2026-09-01', value: 44 },
      { date: '2026-11-20', value: 46.5 },
    ]);
    expect(vo2MaxPoints(undefined)).toEqual([]);
  });
});

describe('Vo2MaxTrendCard', () => {
  const today = '2026-11-24';

  it('shows the latest reading, rating, fitness age and change', () => {
    render(
      <Vo2MaxTrendCard
        metrics={metrics}
        profile={{ date_of_birth: '1991-05-01', gender: 'male' }}
        today={today}
      />
    );
    expect(screen.getByTestId('vo2-latest')).toHaveTextContent('46.5');
    expect(screen.getByTestId('vo2-rating')).toHaveTextContent('Good');
    expect(screen.getByTestId('vo2-fitness-age')).toBeInTheDocument();
    expect(screen.getByTestId('vo2-change')).toHaveTextContent('+2.5');
  });

  it('asks for a date of birth and sex instead of guessing a rating', () => {
    render(
      <Vo2MaxTrendCard
        metrics={metrics}
        profile={{ date_of_birth: null, gender: 'other' }}
        today={today}
      />
    );
    expect(screen.queryByTestId('vo2-rating')).not.toBeInTheDocument();
    expect(screen.getByTestId('vo2-no-rating')).toBeInTheDocument();
    expect(screen.queryByTestId('vo2-fitness-age')).not.toBeInTheDocument();
  });

  it('renders nothing without a reading', () => {
    const { container } = render(
      <Vo2MaxTrendCard
        metrics={[{ entry_date: '2026-11-20', vo2_max: null }]}
        profile={undefined}
        today={today}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
