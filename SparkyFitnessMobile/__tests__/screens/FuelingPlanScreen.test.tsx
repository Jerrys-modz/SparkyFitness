import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FuelingPlanScreen from '../../src/screens/FuelingPlanScreen';
import {
  cancelFuelingSession,
  getFuelingSession,
  startFuelingSession,
} from '../../src/services/fuelingReminders';
import { requestNotificationPermission } from '../../src/services/notifications';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/fuelingReminders', () => ({
  getFuelingSession: jest.fn(),
  startFuelingSession: jest.fn(),
  cancelFuelingSession: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  requestNotificationPermission: jest.fn(),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockGetSession = getFuelingSession as jest.MockedFunction<
  typeof getFuelingSession
>;
const mockStart = startFuelingSession as jest.MockedFunction<
  typeof startFuelingSession
>;
const mockCancel = cancelFuelingSession as jest.MockedFunction<
  typeof cancelFuelingSession
>;
const mockPermission = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;

const renderScreen = () =>
  render(
    <FuelingPlanScreen
      navigation={mockNavigation}
      route={{ params: {} } as any}
    />
  );

describe('FuelingPlanScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
    mockPermission.mockResolvedValue('granted');
    mockStart.mockResolvedValue({ status: 'scheduled', reminderCount: 6 });
    mockCancel.mockResolvedValue(undefined);
  });

  it('plans a 3 hour moderate run with the intermediate cap', async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(getByTestId('fueling-summary').props.children).toBe(
      '60 g/h: take 25 g every 25 min'
    );
  });

  it('suggests no fueling under an hour', async () => {
    const { getByTestId, queryByTestId } = renderScreen();
    fireEvent.changeText(getByTestId('fueling-hours'), '0');
    fireEvent.changeText(getByTestId('fueling-minutes'), '45');
    expect(getByTestId('fueling-none')).toBeTruthy();
    expect(queryByTestId('fueling-summary')).toBeNull();
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
  });

  it('uses the carbs and portion the person types', async () => {
    const { getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId('fueling-carbs-override'), '80');
    fireEvent.changeText(getByTestId('fueling-portion-override'), '40');
    expect(getByTestId('fueling-summary').props.children).toBe(
      '80 g/h: take 40 g every 30 min'
    );
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
  });

  it('sets the reminders from the plan once notifications are allowed', async () => {
    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('fueling-start'));
    });

    expect(mockPermission).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledTimes(1);
    const call = mockStart.mock.calls[0][0];
    expect(call.portionGrams).toBe(25);
    expect(call.offsetsMin[0]).toBe(25);
    expect(call.offsetsMin).toHaveLength(7);
  });

  it('does not schedule anything without notification permission', async () => {
    mockPermission.mockResolvedValue('denied');
    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('fueling-start'));
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('stops a running session', async () => {
    mockGetSession.mockResolvedValue({
      startAtMs: Date.now(),
      portionGrams: 25,
      reminderCount: 6,
      notificationIds: ['a'],
    });
    const { findByTestId } = renderScreen();
    const stop = await findByTestId('fueling-stop');
    await act(async () => {
      fireEvent.press(stop);
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });
});
