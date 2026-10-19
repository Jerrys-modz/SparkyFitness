import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Toast from 'react-native-toast-message';

import CoachingScreen from '../../src/screens/CoachingScreen';
import {
  useCoachingCheckIn,
  useCoachingMutations,
} from '../../src/hooks/useCoachingCheckIn';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { coachingCheckInFixture } from '../helpers/coachingCheckIn';

jest.mock('../../src/hooks/useCoachingCheckIn', () => ({
  useCoachingCheckIn: jest.fn(),
  useCoachingMutations: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
const route = { params: undefined } as never;

const acceptCheckIn = jest.fn();
const saveSettings = jest.fn();
const refetch = jest.fn();

function mockData(
  checkIn: ReturnType<typeof coachingCheckInFixture> | undefined,
  state: { isLoading?: boolean; isError?: boolean } = {}
) {
  jest.mocked(useCoachingCheckIn).mockReturnValue({
    checkIn,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch,
  } as never);
}

const renderScreen = () =>
  render(<CoachingScreen navigation={mockNavigation} route={route} />);

beforeEach(() => {
  jest.clearAllMocks();
  __resetAppPreferencesStoreForTests();
  acceptCheckIn.mockResolvedValue({});
  saveSettings.mockResolvedValue({});
  jest.mocked(useCoachingMutations).mockReturnValue({
    acceptCheckIn,
    isAccepting: false,
    saveSettings,
    isSavingSettings: false,
  } as never);
  mockData(coachingCheckInFixture());
});

describe('CoachingScreen', () => {
  it('shows the trend, the estimate with its uncertainty and both targets', () => {
    renderScreen();

    expect(screen.getByText('Behind your goal')).toBeTruthy();
    expect(
      screen.getByText(
        'Your weight is dropping more slowly than your goal rate, so a lower calorie target is suggested.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('weight-trend-chart')).toBeTruthy();
    expect(screen.getByText('2,300 kcal a day')).toBeTruthy();
    expect(
      screen.getByText('Give or take about 120 kcal from weigh-in noise alone')
    ).toBeTruthy();
    expect(screen.getByText('2,000 kcal')).toBeTruthy();
    expect(screen.getByText('1,800 kcal')).toBeTruthy();
    expect(
      screen.getByText(
        'Limited to a 10% change this week; a further change may follow next week.'
      )
    ).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });

  it('accepts the suggested calories and goes back', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => expect(acceptCheckIn).toHaveBeenCalledWith(1800));
    await waitFor(() =>
      expect(
        (mockNavigation as unknown as { goBack: jest.Mock }).goBack
      ).toHaveBeenCalled()
    );
  });

  it('stays on the screen and says so when the accept is refused', async () => {
    acceptCheckIn.mockRejectedValue(new Error('409'));
    const toast = jest.spyOn(Toast, 'show').mockImplementation(() => undefined);
    renderScreen();
    fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0]![0]).toMatchObject({ type: 'error' });
    expect(
      (mockNavigation as unknown as { goBack: jest.Mock }).goBack
    ).not.toHaveBeenCalled();
  });

  it('remembers “Not now” without changing anything', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Not now'));

    expect(acceptCheckIn).not.toHaveBeenCalled();
    expect(useAppPreferencesStore.getState().coachingDismissedSignature).toBe(
      '2026-10-17:1800'
    );
    expect(
      (mockNavigation as unknown as { goBack: jest.Mock }).goBack
    ).toHaveBeenCalled();
  });

  it('offers no Accept when Calorie Settings own the target', () => {
    mockData(coachingCheckInFixture({ goalManagedBySettings: true }));
    renderScreen();

    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText(/set by Calorie Settings/)).toBeTruthy();
  });

  it('lists what is missing instead of a suggestion when data is thin', () => {
    mockData(
      coachingCheckInFixture({
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
          ...coachingCheckInFixture().dataQuality,
          ready: false,
          missingLoggedDays: 3,
          missingWeighIns: 2,
        },
      })
    );
    renderScreen();

    expect(screen.getByText('Not enough data yet')).toBeTruthy();
    expect(
      screen.getByText('Log 3 more days for a reliable estimate')
    ).toBeTruthy();
    expect(screen.getByText('Weigh in 2 more times')).toBeTruthy();
    expect(screen.getByText('Not enough data to estimate yet.')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('saves the goal direction, rate and check-in day', async () => {
    renderScreen();

    fireEvent.press(screen.getByText('Gain'));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ direction: 'gain' })
    );

    fireEvent.press(screen.getByText('0.25 kg'));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ rateKgPerWeek: 0.25 })
    );

    const wednesday = new Date(2024, 0, 10).toLocaleDateString('en', {
      weekday: 'short',
    });
    fireEvent.press(screen.getByText(wednesday));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ checkInWeekday: 3 })
    );
  });

  it('hides the rate for a maintain goal', () => {
    mockData(
      coachingCheckInFixture({
        settings: {
          direction: 'maintain',
          rateKgPerWeek: 0,
          checkInWeekday: 0,
        },
      })
    );
    renderScreen();
    expect(screen.queryByText('Rate per week')).toBeNull();
  });

  it('offers a retry when the check-in cannot be loaded', () => {
    mockData(undefined, { isError: true });
    renderScreen();

    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
