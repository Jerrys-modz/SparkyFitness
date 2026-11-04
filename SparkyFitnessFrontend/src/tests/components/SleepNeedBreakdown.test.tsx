import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { DailyNeedData } from '@workspace/shared';
import SleepNeedBreakdown from '@/pages/Reports/SleepScience/SleepNeedBreakdown';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      const opts = second as Record<string, unknown> | undefined;
      const template = (opts?.['defaultValue'] as string) ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(opts?.[name] ?? '')
      );
    },
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

// The chart itself is not under test; recharts needs real layout in jsdom.
jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Empty = () => null;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    Cell: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

const baseNeed: DailyNeedData = {
  date: '2026-10-22',
  baseline_need: 8,
  strain_addition: 0.45,
  debt_addition: 0,
  nap_subtraction: 0,
  total_need: 8.45,
  method: 'default',
  confidence: 'low',
  training_load_score: 180,
  current_debt_hours: 0,
  nap_minutes: 0,
  recovery_score_yesterday: null,
};

describe('SleepNeedBreakdown', () => {
  it('shows the training load score from the day’s workouts', () => {
    render(<SleepNeedBreakdown data={baseNeed} />);
    const row = screen.getByTestId('sleep-need-training-load');
    expect(row).toHaveTextContent('Training load');
    expect(row).toHaveTextContent('180');
  });

  it('hides the training load row when no workout was logged', () => {
    render(
      <SleepNeedBreakdown
        data={{ ...baseNeed, strain_addition: 0, training_load_score: null }}
      />
    );
    expect(
      screen.queryByTestId('sleep-need-training-load')
    ).not.toBeInTheDocument();
  });
});
