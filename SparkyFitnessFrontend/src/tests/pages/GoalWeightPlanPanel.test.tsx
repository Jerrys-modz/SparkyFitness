import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { GoalWeightPlanResponse } from '@workspace/shared';
import { GoalWeightPlanPanel } from '@/pages/Goals/GoalWeightPlanPanel';

const saveAllPreferences = jest.fn();
const invalidateQueries = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, arg?: string | Record<string, unknown>) => {
      if (typeof arg === 'string') return arg;
      let text = String(arg?.['defaultValue'] ?? _key);
      for (const [name, value] of Object.entries(arg ?? {})) {
        text = text.replace(`{{${name}}}`, String(value));
      }
      return text;
    },
  }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useRefreshGoalWeightPlan: () => invalidateQueries,
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
    formatDate: (day: string) => day,
    saveAllPreferences,
  }),
}));
jest.mock('@/utils/calculationLabels', () => ({
  getGoalModeLabel: (_t: unknown, mode: string) =>
    ({ cut: 'Cut', high_cut: 'High cut', maintain: 'Maintain' })[mode] ?? mode,
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
  schedule: { plannedKg: 80, daysAhead: -3 },
};
const data = (
  overrides: Partial<typeof plan> = {},
  goalMode = 'cut'
): GoalWeightPlanResponse => ({
  goalKg: 78,
  targetDate: '2027-01-29',
  setOn: '2026-12-18',
  currentKg: 80,
  goalMode,
  weeklyChangeKg: 0,
  plan: { ...plan, ...overrides },
});

describe('GoalWeightPlanPanel', () => {
  beforeEach(() => {
    saveAllPreferences.mockReset().mockResolvedValue(undefined);
    invalidateQueries.mockReset();
  });

  it('shows the pace the date needs next to the Cut setting', () => {
    render(<GoalWeightPlanPanel data={data()} />);
    expect(
      screen.getByText(
        'To reach 78 kg by 2027-01-29: lose 0.5 kg a week (about 429 kcal a day under maintenance).'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your Cut setting: about 0.3 kg a week, reaching 78 kg around 2027-02-17.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 days behind the planned path.')
    ).toBeInTheDocument();
  });

  it('applies the suggested pace as the weekly goal only when tapped', async () => {
    render(<GoalWeightPlanPanel data={data()} />);
    expect(saveAllPreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Use lose 0.5 kg a week'));
    await waitFor(() =>
      expect(saveAllPreferences).toHaveBeenCalledWith({
        goalMode: 'weekly',
        goalModeWeeklyChangeKg: -0.5,
      })
    );
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it('offers High cut when it matches', async () => {
    render(<GoalWeightPlanPanel data={data({ highCutKgPerWeek: -0.52 })} />);
    fireEvent.click(screen.getByText('Use High cut'));
    await waitFor(() =>
      expect(saveAllPreferences).toHaveBeenCalledWith({ goalMode: 'high_cut' })
    );
  });

  it('offers no change when on course', () => {
    render(
      <GoalWeightPlanPanel
        data={data({ status: 'on_course', settingKgPerWeek: -0.5 })}
      />
    );
    expect(
      screen.getByText('Your calorie goal is on course for this date.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('warns about a fast pace and shows the earliest date under the floor', () => {
    render(
      <GoalWeightPlanPanel
        data={data({
          safetyZone: 'red',
          requiredPercentPerWeek: 2.5,
          belowFloor: true,
          earliestDate: '2027-02-10',
        })}
      />
    );
    expect(
      screen.getByText(/needs 2.5% of your body weight/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/earliest date reachable above it is about 2027-02-10/)
    ).toBeInTheDocument();
  });

  describe('below the safety floor', () => {
    const below = {
      requiredKgPerWeek: -1,
      requiredDailyKcal: -857,
      suggestedCalories: 1540,
      belowFloor: true,
      floorKcal: 1900,
      earliestDate: '2027-03-30',
      fastestKgPerWeek: -0.58,
    };

    it('Standard or Custom floor: no button for the unreachable pace, the fastest allowed one instead', async () => {
      render(
        <GoalWeightPlanPanel
          data={data({ ...below, floorEnforced: true, highCutKgPerWeek: -0.9 })}
        />
      );
      expect(screen.getByTestId('goal-weight-below-floor')).toHaveTextContent(
        /earliest date reachable above it is about 2027-03-30/
      );
      expect(screen.queryByText('Use lose 1 kg a week')).toBeNull();
      expect(screen.queryByText('Use High cut')).toBeNull();
      fireEvent.click(
        screen.getByText('Use the fastest allowed: lose 0.58 kg a week')
      );
      await waitFor(() =>
        expect(saveAllPreferences).toHaveBeenCalledWith({
          goalMode: 'weekly',
          goalModeWeeklyChangeKg: -0.58,
        })
      );
    });

    it('Disabled floor: still warns, but keeps the button for the pace', async () => {
      render(
        <GoalWeightPlanPanel data={data({ ...below, floorEnforced: false })} />
      );
      expect(screen.getByTestId('goal-weight-below-floor')).toHaveTextContent(
        /safety floor is off/
      );
      expect(screen.queryByText(/fastest allowed/)).toBeNull();
      fireEvent.click(screen.getByText('Use lose 1 kg a week'));
      await waitFor(() =>
        expect(saveAllPreferences).toHaveBeenCalledWith({
          goalMode: 'weekly',
          goalModeWeeklyChangeKg: -1,
        })
      );
    });

    it('an older server without the flag still holds the floor', () => {
      render(<GoalWeightPlanPanel data={data(below)} />);
      expect(screen.queryByText('Use lose 1 kg a week')).toBeNull();
      expect(screen.getByText(/fastest allowed/)).toBeInTheDocument();
    });

    it('offers nothing to apply when no pace is reachable above the floor', () => {
      render(
        <GoalWeightPlanPanel
          data={data({
            ...below,
            floorEnforced: true,
            earliestDate: null,
            fastestKgPerWeek: null,
          })}
        />
      );
      expect(screen.getByTestId('goal-weight-below-floor')).toHaveTextContent(
        'This pace would put calories under the safe minimum.'
      );
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('asks for a new date once it has passed, without moving it', () => {
    render(
      <GoalWeightPlanPanel
        data={data({ status: 'date_passed', requiredKgPerWeek: null })}
      />
    );
    expect(
      screen.getByText(
        'Your target date (2027-01-29) has passed. Pick a new date to see the pace it needs.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers maintain once the goal is reached', async () => {
    render(
      <GoalWeightPlanPanel
        data={data({ status: 'reached', requiredKgPerWeek: null })}
      />
    );
    fireEvent.click(screen.getByText('Switch calorie goal to Maintain'));
    await waitFor(() =>
      expect(saveAllPreferences).toHaveBeenCalledWith({ goalMode: 'maintain' })
    );
  });
});
