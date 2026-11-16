import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GoalWeightPlanResponse } from '@workspace/shared';
import GoalWeightPlanCard from '../../src/components/GoalWeightPlanCard';
import { updatePreferences } from '../../src/services/api/preferencesApi';

jest.mock('../../src/services/api/preferencesApi', () => ({
  updatePreferences: jest.fn().mockResolvedValue({}),
}));

const plan: NonNullable<GoalWeightPlanResponse['plan']> = {
  status: 'needs_faster',
  daysLeft: 28,
  remainingKg: -2,
  requiredKgPerWeek: -0.5,
  requiredPercentPerWeek: 0.63,
  safetyZone: 'green',
  requiredDailyKcal: -429,
  suggestedCalories: 2070,
  belowFloor: false,
  earliestDate: null,
  settingKgPerWeek: -0.3,
  settingReachDate: '2027-02-17',
  highCutKgPerWeek: null,
  schedule: { plannedKg: 80, daysAhead: 3 },
};
const data = (
  overrides: Partial<typeof plan> = {}
): GoalWeightPlanResponse => ({
  goalKg: 78,
  targetDate: '2027-01-29',
  setOn: '2026-12-18',
  currentKg: 80,
  goalMode: 'cut',
  weeklyChangeKg: 0,
  plan: { ...plan, ...overrides },
});

const renderCard = (value: GoalWeightPlanResponse) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GoalWeightPlanCard data={value} weightUnit="kg" />
    </QueryClientProvider>
  );

describe('GoalWeightPlanCard', () => {
  beforeEach(() => (updatePreferences as jest.Mock).mockClear());

  it('compares the date with the Cut setting', () => {
    renderCard(data());
    expect(
      screen.getByText(/To reach 78 kg by .*: lose 0.5 kg a week/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Your Cut \(-15%\) setting: about 0.3 kg a week/)
    ).toBeTruthy();
    expect(screen.getByText('3 days ahead of the planned path.')).toBeTruthy();
  });

  it('switches to the weekly pace only when tapped', async () => {
    renderCard(data());
    expect(updatePreferences).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('goal-weight-plan-use-pace'));
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        goal_mode: 'weekly',
        goal_mode_weekly_change_kg: -0.5,
      })
    );
  });

  it('offers High cut when it matches', async () => {
    renderCard(data({ highCutKgPerWeek: -0.52 }));
    fireEvent.press(screen.getByTestId('goal-weight-plan-use-high-cut'));
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ goal_mode: 'high_cut' })
    );
  });

  it('shows no actions when on course', () => {
    renderCard(data({ status: 'on_course', settingKgPerWeek: -0.5 }));
    expect(screen.queryByTestId('goal-weight-plan-use-pace')).toBeNull();
    expect(
      screen.getByText('Your calorie goal is on course for this date.')
    ).toBeTruthy();
  });

  it('warns under the safety floor with the earliest date', () => {
    renderCard(
      data({
        safetyZone: 'red',
        requiredPercentPerWeek: 2.5,
        belowFloor: true,
        earliestDate: '2027-02-10',
      })
    );
    expect(screen.getByText(/needs 2.5% of your body weight/)).toBeTruthy();
    expect(screen.getByText(/earliest date reachable above it/)).toBeTruthy();
  });

  it('offers maintain once the goal is reached', async () => {
    renderCard(data({ status: 'reached', requiredKgPerWeek: null }));
    fireEvent.press(screen.getByTestId('goal-weight-plan-maintain'));
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ goal_mode: 'maintain' })
    );
  });
});
