import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BloodPressureAddScreen from '../../src/screens/BloodPressureAddScreen';
import {
  useCreateBloodPressure,
  useUpdateBloodPressure,
} from '../../src/hooks/useBloodPressure';

jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/components/CalendarSheet', () => 'CalendarSheet');
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useBloodPressure', () => ({
  useCreateBloodPressure: jest.fn(),
  useUpdateBloodPressure: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const createAsync = jest.fn();
const updateAsync = jest.fn();

const renderScreen = (params?: object) =>
  render(
    <BloodPressureAddScreen
      navigation={navigation as never}
      route={{ params } as never}
    />
  );

describe('BloodPressureAddScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createAsync.mockResolvedValue({});
    updateAsync.mockResolvedValue({});
    jest
      .mocked(useCreateBloodPressure)
      .mockReturnValue({ mutateAsync: createAsync, isPending: false } as never);
    jest
      .mocked(useUpdateBloodPressure)
      .mockReturnValue({ mutateAsync: updateAsync, isPending: false } as never);
  });

  it('saves a valid reading with the chosen arm and goes back', async () => {
    const { getByLabelText, getByText, getByRole } = renderScreen();
    fireEvent.changeText(getByLabelText('Systolic'), '122');
    fireEvent.changeText(getByLabelText('Diastolic'), '79');
    fireEvent.press(getByText('Left arm'));
    fireEvent.press(getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createAsync).toHaveBeenCalled());
    expect(createAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        systolic_mmhg: 122,
        diastolic_mmhg: 79,
        pulse_bpm: null,
        arm: 'left',
        body_position: null,
      })
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('does not save while systolic is not above diastolic', () => {
    const { getByLabelText, getByText } = renderScreen();
    fireEvent.changeText(getByLabelText('Systolic'), '80');
    fireEvent.changeText(getByLabelText('Diastolic'), '90');
    expect(
      getByText(/with the systolic value above the diastolic one/)
    ).toBeTruthy();
    expect(createAsync).not.toHaveBeenCalled();
  });

  it('edits an existing reading without moving its time', async () => {
    const at = Date.parse('2026-11-20T08:00:00Z');
    const { getByLabelText, getByRole } = renderScreen({
      reading: {
        id: 'v1',
        at,
        systolic: 130,
        diastolic: 85,
        pulse: null,
        arm: null,
        bodyPosition: null,
        note: null,
      },
    });
    fireEvent.changeText(getByLabelText('Systolic'), '128');
    fireEvent.press(getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalled());
    const call = updateAsync.mock.calls[0]?.[0] as {
      id: string;
      body: Record<string, unknown>;
    };
    expect(call.id).toBe('v1');
    expect(call.body.systolic_mmhg).toBe(128);
    expect(call.body).not.toHaveProperty('timestamp');
  });
});
