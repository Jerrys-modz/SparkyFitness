import { renderHook, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMeasurementChartWidgets } from '@/pages/Reports/MeasurementChartsGrid';
import { addDays, type CheckInMeasurementsResponse } from '@workspace/shared';

const mockPreferences = {
  loggingLevel: 'ERROR',
  formatDateInUserTimezone: (d: unknown) => `day:${String(d)}`,
  weightUnit: 'kg',
  measurementUnit: 'cm',
  energyUnit: 'kcal',
  convertWeight: (v: number) => v,
  convertMeasurement: (v: number) => v,
  convertEnergy: (v: number) => v,
  getEnergyUnitString: () => 'kcal',
  chartScaleMode: 'day' as const,
};

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (_k: string, d?: string, vars?: Record<string, unknown>) => {
      let str = d || _k;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(`{{${k}}}`, String(v));
        });
      }
      return str;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockPreferences,
}));

jest.mock('@/utils/numberFormatting', () => ({
  formatWeight: (v: number) => `${v.toFixed(1)} kg`,
  formatMeasurement: (v: number) => `${v.toFixed(1)} cm`,
}));

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({
    children,
  }: {
    children: (isMax: boolean, zoom: number) => React.ReactNode;
  }) => children(false, 1),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 80 kg throughout; body fat falls half a point a week from 25%.
const measurements = Array.from({ length: 15 }, (_, i) => ({
  entry_date: addDays('2026-01-01', i * 2),
  weight: 80,
  body_fat_percentage: 25 - (0.5 / 7) * i * 2,
})) as unknown as CheckInMeasurementsResponse[];

const renderBodyFatCard = (targetBodyFatPercent: number | null) => {
  const { result } = renderHook(() =>
    useMeasurementChartWidgets({
      measurementData: measurements,
      targetBodyFatPercent,
    })
  );
  const widget = result.current.find((w) => w.key === 'body_fat_percentage');
  if (!widget) throw new Error('no body fat widget');
  render(<>{widget.render()}</>);
};

describe('Body Fat % chart goal', () => {
  it('projects the goal date and shows the implied goal weight as an estimate', () => {
    renderBodyFatCard(20);
    const summary = screen.getByTestId('body-fat-trend-summary');
    expect(summary).toHaveTextContent(/per week · Goal projected day:2026-/);
    const goal = screen.getByTestId('body-fat-goal-line');
    expect(goal).toHaveTextContent('Goal 20.0%');
    expect(goal).toHaveTextContent('at your current lean mass (estimate)');
    // The trend lags the readings a little, so the weight is near, not exactly,
    // 80 x (1 - 0.23) / 0.8.
    const match = /about ([\d.]+) kg/.exec(goal.textContent ?? '');
    expect(Number(match?.[1])).toBeGreaterThan(75);
    expect(Number(match?.[1])).toBeLessThan(78);
  });

  it('shows no goal line without a goal', () => {
    renderBodyFatCard(null);
    expect(screen.getByTestId('body-fat-trend-summary')).not.toHaveTextContent(
      'Goal projected'
    );
    expect(screen.queryByTestId('body-fat-goal-line')).not.toBeInTheDocument();
  });

  it('keeps the weight summary off the body fat card', () => {
    renderBodyFatCard(20);
    expect(
      screen.queryByTestId('weight-trend-summary')
    ).not.toBeInTheDocument();
  });
});
