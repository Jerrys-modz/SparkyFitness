import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  addDays,
  computeWeightMilestones,
  computeWeightProgress,
  estimateFatFromEnergyBalance,
  type WeightProgressSettings,
  type WeightProgressStart,
} from '@workspace/shared';
import WeightProgressCard from '@/pages/Reports/WeightProgressCard';
import type { WeightProgressData } from '@/hooks/Reports/useWeightProgress';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | Record<string, unknown>,
      options?: Record<string, unknown>
    ) => {
      const text = typeof fallback === 'string' ? fallback : key;
      const vars = typeof fallback === 'string' ? options : fallback;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(vars?.[name])
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    timezone: 'UTC',
    energyUnit: 'kcal',
    formatDateInUserTimezone: (day: string) => day,
    convertWeight: (value: number) => value,
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));

const mockUseWeightProgress = jest.fn<WeightProgressData, [number | null]>();
jest.mock('@/hooks/Reports/useWeightProgress', () => ({
  useWeightProgress: (target: number | null) => mockUseWeightProgress(target),
}));

const START = '2026-01-01';
const samples = Array.from({ length: 61 }, (_, i) => ({
  date: addDays(START, i),
  weight: 100 - 0.2 * i,
}));
const start: WeightProgressStart = {
  date: START,
  weight: 100,
  source: 'first_measurement',
};
const intake = Array.from({ length: 20 }, (_, i) => ({
  date: addDays(START, 30 + i),
  calories: 1800,
}));

const data = (
  settings: Partial<WeightProgressSettings> = {},
  updateSettings = jest.fn()
): WeightProgressData => ({
  isLoading: false,
  progress: computeWeightProgress({ samples, start, target: 80 }),
  milestones: computeWeightMilestones({
    samples,
    start,
    target: 80,
    unit: 'kg',
  }),
  energy: estimateFatFromEnergyBalance({
    intake,
    expenditureKcal: 2300,
    from: addDays(START, 30),
    to: addDays(START, 59),
    samples,
  }),
  expenditureKcal: 2300,
  settings: {
    customStart: null,
    milestonesHidden: false,
    seen: { startDate: START, ids: ['amount:5:kg', 'percent:5'] },
    ...settings,
  },
  updateSettings,
});

describe('WeightProgressCard', () => {
  it('shows start, trend change, percent and progress to goal', () => {
    mockUseWeightProgress.mockReturnValue(data());
    render(<WeightProgressCard targetWeightKg={80} />);
    expect(screen.getByTestId('weight-progress-start')).toHaveTextContent(
      '100 kg'
    );
    expect(screen.getByTestId('weight-progress-change')).toHaveTextContent(
      '-11.4 kg'
    );
    expect(screen.getByTestId('weight-progress-percent')).toHaveTextContent(
      '-11.4%'
    );
    expect(screen.getByTestId('weight-progress-goal')).toHaveTextContent('57%');
    expect(mockUseWeightProgress).toHaveBeenCalledWith(80);
  });

  it('celebrates only milestones not seen before, and dismisses them', () => {
    const update = jest.fn();
    mockUseWeightProgress.mockReturnValue(data({}, update));
    render(<WeightProgressCard targetWeightKg={80} />);
    const banner = screen.getByTestId('weight-milestone-celebration');
    expect(banner).toHaveTextContent('10 kg from your start');
    expect(banner).toHaveTextContent('Halfway to goal');
    expect(banner).not.toHaveTextContent('5 kg from your start');
    fireEvent.click(screen.getByText('Dismiss'));
    expect(update).toHaveBeenCalledWith({
      seen: {
        startDate: START,
        ids: [
          'amount:5:kg',
          'percent:5',
          'amount:10:kg',
          'percent:10',
          'halfway',
        ],
      },
    });
  });

  it('lets milestones be switched off', () => {
    const update = jest.fn();
    mockUseWeightProgress.mockReturnValue(
      data({ milestonesHidden: true }, update)
    );
    render(<WeightProgressCard targetWeightKg={80} />);
    expect(screen.queryByTestId('weight-milestones')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('weight-milestone-celebration')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show milestones'));
    expect(update).toHaveBeenCalledWith({ milestonesHidden: false });
  });

  it('labels the fat figure as an estimate beside the trend change', () => {
    mockUseWeightProgress.mockReturnValue(data());
    render(<WeightProgressCard targetWeightKg={80} />);
    expect(screen.getByText('From your food log (estimate)')).toBeVisible();
    // 20 days x 500 kcal = 10000 kcal / 9441 kcal per kg.
    expect(screen.getByTestId('weight-fat-estimated')).toHaveTextContent(
      'Estimated fat lost~1.1 kg'
    );
    // The trend fell 0.2 kg a day over days 30 to 59.
    expect(screen.getByTestId('weight-fat-actual')).toHaveTextContent(
      '-5.8 kg'
    );
  });

  it('asks for a weigh-in when there is none', () => {
    mockUseWeightProgress.mockReturnValue({
      ...data(),
      progress: null,
      milestones: null,
      energy: null,
    });
    render(<WeightProgressCard targetWeightKg={null} />);
    expect(
      screen.getByText('Log your weight to see your progress here.')
    ).toBeInTheDocument();
  });
});
