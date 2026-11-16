import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  addDays,
  computeWeightMilestones,
  computeWeightProgress,
  estimateFatFromEnergyBalance,
  type WeightProgressSettings,
  type WeightProgressStart,
} from '@workspace/shared';

import WeightProgressCard, {
  signedWeightText,
} from '../../../src/components/reports/WeightProgressCard';
import type { WeightProgressData } from '../../../src/hooks/useWeightProgress';

const mockUseWeightProgress = jest.fn<WeightProgressData, [unknown]>();
jest.mock('../../../src/hooks/useWeightProgress', () => ({
  useWeightProgress: (args: unknown) => mockUseWeightProgress(args),
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
    intake: Array.from({ length: 3 }, (_, i) => ({
      date: addDays(START, 40 + i),
      calories: 1800,
    })),
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

describe('WeightProgressCard (mobile)', () => {
  it('shows the trend-based figures in the display unit', () => {
    mockUseWeightProgress.mockReturnValue(data());
    render(<WeightProgressCard targetWeightKg={80} weightMode="kg" />);
    expect(screen.getByTestId('weight-progress-start')).toHaveTextContent(
      /100 kg/
    );
    expect(screen.getByTestId('weight-progress-change')).toHaveTextContent(
      /-11\.4 kg/
    );
    expect(screen.getByTestId('weight-progress-percent')).toHaveTextContent(
      /-11\.4%/
    );
    expect(screen.getByTestId('weight-progress-goal')).toHaveTextContent(/57%/);
    expect(mockUseWeightProgress).toHaveBeenCalledWith({
      targetWeightKg: 80,
      unit: 'kg',
    });
  });

  it('celebrates new milestones once and can be dismissed or switched off', () => {
    const update = jest.fn();
    mockUseWeightProgress.mockReturnValue(data({}, update));
    render(<WeightProgressCard targetWeightKg={80} weightMode="kg" />);
    expect(
      screen.getByTestId('weight-milestone-celebration')
    ).toHaveTextContent(/Halfway to goal/);
    fireEvent.press(screen.getByTestId('weight-milestone-dismiss'));
    expect(update).toHaveBeenCalledWith({
      seen: expect.objectContaining({ startDate: START }),
    });
    fireEvent.press(screen.getByTestId('weight-milestones-hide'));
    expect(update).toHaveBeenCalledWith({ milestonesHidden: true });
  });

  it('hides milestones when switched off', () => {
    mockUseWeightProgress.mockReturnValue(data({ milestonesHidden: true }));
    render(<WeightProgressCard targetWeightKg={80} weightMode="lbs" />);
    expect(screen.queryByTestId('weight-milestones')).toBeNull();
    expect(screen.getByTestId('weight-milestones-show')).toBeTruthy();
  });

  it('asks for more food logs before showing the fat estimate', () => {
    mockUseWeightProgress.mockReturnValue(data());
    render(<WeightProgressCard targetWeightKg={80} weightMode="kg" />);
    expect(screen.getByTestId('weight-fat-estimate')).toHaveTextContent(
      /at least 7 days/
    );
  });

  it('renders nothing without a weigh-in', () => {
    mockUseWeightProgress.mockReturnValue({ ...data(), progress: null });
    render(<WeightProgressCard targetWeightKg={null} weightMode="kg" />);
    expect(screen.queryByTestId('weight-progress-card')).toBeNull();
  });

  it('never signs a change that rounds to nothing', () => {
    expect(signedWeightText(-0.01, 'kg')).toBe('0 kg');
    expect(signedWeightText(-2.44, 'kg')).toBe('-2.4 kg');
  });
});
