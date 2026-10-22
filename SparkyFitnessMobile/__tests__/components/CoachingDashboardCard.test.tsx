import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CoachingDashboardCard from '../../src/components/CoachingDashboardCard';
import { useCoachingCheckIn } from '../../src/hooks/useCoachingCheckIn';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { coachingCheckInFixture } from '../helpers/coachingCheckIn';

jest.mock('../../src/hooks/useCoachingCheckIn', () => ({
  useCoachingCheckIn: jest.fn(),
}));

const navigate = jest.fn();
const navigation = { navigate } as never;

const mockCheckIn = (
  checkIn: ReturnType<typeof coachingCheckInFixture> | undefined,
  isError = false
) =>
  jest.mocked(useCoachingCheckIn).mockReturnValue({
    checkIn,
    isLoading: false,
    isError,
    refetch: jest.fn(),
  } as never);

beforeEach(() => {
  jest.clearAllMocks();
  __resetAppPreferencesStoreForTests();
});

describe('CoachingDashboardCard', () => {
  it('shows the verdict and the suggested target, and opens the Coaching screen', () => {
    mockCheckIn(coachingCheckInFixture());
    render(<CoachingDashboardCard navigation={navigation} />);

    expect(screen.getByText('Weekly Coaching')).toBeTruthy();
    expect(screen.getByText('Behind your goal')).toBeTruthy();
    expect(screen.getByText('Suggested 1,800 kcal (now 2,000)')).toBeTruthy();
    expect(
      screen.getByText('Estimated burn about 2,300 kcal a day')
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('coaching-dashboard-card'));
    expect(navigate).toHaveBeenCalledWith('Coaching');
  });

  it('says the targets are unchanged when on track', () => {
    mockCheckIn(
      coachingCheckInFixture({
        reason: 'on-track',
        suggested: null,
        actionable: false,
        changeKcal: 0,
        limits: [],
      })
    );
    render(<CoachingDashboardCard navigation={navigation} />);

    expect(screen.getByText('On track')).toBeTruthy();
    expect(screen.getByText('Targets unchanged')).toBeTruthy();
  });

  it('tells the person what is missing when there is not enough data', () => {
    mockCheckIn(
      coachingCheckInFixture({
        reason: 'insufficient-data',
        suggested: null,
        actionable: false,
        expenditure: {
          kcal: null,
          rawKcal: null,
          avgIntakeKcal: null,
          marginKcal: null,
          history: [],
        },
        dataQuality: {
          ...coachingCheckInFixture().dataQuality,
          ready: false,
          missingLoggedDays: 3,
          excludedDays: 0,
          outlierWeighIns: 0,
        },
      })
    );
    render(<CoachingDashboardCard navigation={navigation} />);

    expect(screen.getByText('Not enough data yet')).toBeTruthy();
    expect(
      screen.getByText('Log 3 more days for a reliable estimate')
    ).toBeTruthy();
    expect(screen.queryByText(/Estimated burn/)).toBeNull();
  });

  it('uses the singular for one missing day', () => {
    mockCheckIn(
      coachingCheckInFixture({
        reason: 'insufficient-data',
        suggested: null,
        dataQuality: {
          ...coachingCheckInFixture().dataQuality,
          ready: false,
          missingLoggedDays: 1,
        },
      })
    );
    render(<CoachingDashboardCard navigation={navigation} />);
    expect(
      screen.getByText('Log 1 more day for a reliable estimate')
    ).toBeTruthy();
  });

  it('notes a postponed suggestion instead of repeating it', () => {
    const checkIn = coachingCheckInFixture();
    useAppPreferencesStore.setState({
      coachingDismissedSignature: `${checkIn.asOf}:${checkIn.suggested!.calories}`,
    });
    mockCheckIn(checkIn);
    render(<CoachingDashboardCard navigation={navigation} />);

    expect(
      screen.getByText('You postponed this suggestion. Tap to review.')
    ).toBeTruthy();
    expect(screen.queryByText(/Suggested/)).toBeNull();
  });

  it('shows a short error rather than vanishing when the first load fails', () => {
    mockCheckIn(undefined, true);
    render(<CoachingDashboardCard navigation={navigation} />);
    expect(screen.getByTestId('coaching-dashboard-card-error')).toBeTruthy();
  });

  it('renders nothing while loading', () => {
    mockCheckIn(undefined);
    render(<CoachingDashboardCard navigation={navigation} />);
    expect(screen.queryByTestId('coaching-dashboard-card')).toBeNull();
  });
});
