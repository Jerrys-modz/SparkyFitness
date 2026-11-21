import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GoalSetupScreen from '../../src/screens/GoalSetupScreen';
import { testServer } from '../hooks/queryTestUtils';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('../../src/components/CalendarSheet', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="calendar-sheet" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { default_weight_unit: 'kg', default_measurement_unit: 'cm' },
    isLoading: false,
  }),
}));

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { gender: 'female', date_of_birth: '1992-03-04' },
  }),
}));

jest.mock('../../src/hooks/useMeasurements', () => ({
  useLatestMeasurementsOnOrBefore: () => ({
    latestMeasurements: { weight: 68, height: 170 },
  }),
}));

const mockSave = jest.fn();
const mockSkip = jest.fn();
jest.mock('../../src/hooks/useGoalSetup', () => ({
  goalSetupAccount: () =>
    Promise.resolve(require('../hooks/queryTestUtils').testServer),
  useSaveGoalSetup: () => ({ mutate: mockSave, isPending: false }),
  useSkipGoalSetup: () => ({ mutate: mockSkip, isPending: false }),
}));

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  setOptions: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

function renderScreen(params?: { fromSignIn?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalSetupScreen navigation={mockNavigation} route={{ params } as any} />
    </QueryClientProvider>
  );
}

describe('GoalSetupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prefills from the account and walks to the plan', async () => {
    const screen = renderScreen();
    const next = () =>
      fireEvent.press(screen.getByTestId('goal-setup-continue'));

    // Sex comes from the profile, so Continue is already enabled.
    next();
    fireEvent.press(screen.getByTestId('goal-setup-goal-lose_weight'));
    next();
    expect(screen.getByTestId('goal-setup-weight').props.value).toBe('68');
    next();
    expect(screen.getByTestId('goal-setup-height-cm').props.value).toBe('170');
    next();
    next(); // birth date from the profile
    fireEvent.press(screen.getByTestId('goal-setup-body-fat-high'));
    next();
    fireEvent.changeText(screen.getByTestId('goal-setup-target-weight'), '62');
    next();
    next(); // three meals by default
    fireEvent.press(screen.getByTestId('goal-setup-activity-moderate'));
    next();
    fireEvent.press(screen.getByTestId('goal-setup-burned-no'));
    next();

    expect(screen.getByText('Your plan')).toBeTruthy();
    expect(screen.getByTestId('goal-setup-plan-calories')).toBeTruthy();

    await waitFor(() =>
      expect(
        screen.getByTestId('goal-setup-save').props.accessibilityState?.disabled
      ).toBeFalsy()
    );
    fireEvent.press(screen.getByTestId('goal-setup-save'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        serverConfig: testServer,
        answers: expect.objectContaining({
          sex: 'female',
          primaryGoal: 'lose_weight',
          weightKg: 68,
          heightCm: 170,
          targetWeightKg: 62,
          activityLevel: 'moderate',
          addBurnedCalories: false,
        }),
        units: { weightUnit: undefined, measurementUnit: undefined },
      }),
      expect.any(Object)
    );
  });

  it('keeps Continue disabled until the step is answered', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('goal-setup-continue'));
    expect(
      screen.getByTestId('goal-setup-continue').props.accessibilityState
        ?.disabled
    ).toBe(true);
  });

  it('converts a weight typed in pounds to kg', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('goal-setup-continue'));
    fireEvent.press(screen.getByTestId('goal-setup-goal-gain_weight'));
    fireEvent.press(screen.getByTestId('goal-setup-continue'));
    fireEvent.press(screen.getByText('lbs'));
    expect(screen.getByTestId('goal-setup-weight').props.value).toBe('149.9');
  });

  it('skips setup and goes to the app after sign-in', async () => {
    mockSkip.mockImplementation((_account, options) => options.onSettled());
    const screen = renderScreen({ fromSignIn: true });
    // The account is resolved asynchronously when the screen opens.
    await act(async () => {});
    fireEvent.press(screen.getByText('Skip'));
    expect(mockSkip).toHaveBeenCalledWith(testServer, expect.any(Object));
    expect(mockNavigation.replace).toHaveBeenCalledWith('Tabs', {
      screen: 'Dashboard',
    });
  });

  it('returns to Goals when opened from there', async () => {
    const screen = renderScreen();
    await act(async () => {});
    fireEvent.press(screen.getByText('Back'));
    expect(mockNavigation.replace).toHaveBeenCalledWith('Goals');
  });
});
