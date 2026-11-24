import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import BloodPressureScreen from '../../src/screens/BloodPressureScreen';
import {
  useBloodPressureRange,
  useDeleteBloodPressure,
  type BloodPressureReading,
} from '../../src/hooks/useBloodPressure';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock(
  '../../src/components/bloodPressure/BloodPressureChart',
  () => 'Chart'
);
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useBloodPressure', () => ({
  useBloodPressureRange: jest.fn(),
  useDeleteBloodPressure: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: undefined } as never;
const mutate = jest.fn();

const reading = (
  over: Partial<BloodPressureReading> = {}
): BloodPressureReading => ({
  id: 'v1',
  at: Date.parse('2026-11-24T08:00:00Z'),
  date: '2026-11-24',
  hour: 8,
  systolic: 138,
  diastolic: 86,
  pulse: 64,
  arm: null,
  bodyPosition: null,
  note: null,
  manual: true,
  ...over,
});

const mockRange = (readings: BloodPressureReading[]) =>
  jest.mocked(useBloodPressureRange).mockReturnValue({
    readings,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as never);

describe('BloodPressureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDeleteBloodPressure).mockReturnValue({ mutate } as never);
  });

  it('offers to add a first reading when there are none', () => {
    mockRange([]);
    const { getByText } = render(
      <BloodPressureScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Add reading'));
    expect(
      (navigation as unknown as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('BloodPressureAdd', {});
  });

  it('shows the latest reading with its category', () => {
    mockRange([reading()]);
    const { getAllByText } = render(
      <BloodPressureScreen navigation={navigation} route={route} />
    );
    expect(getAllByText(/138\/86/).length).toBeGreaterThan(0);
    expect(getAllByText(/Stage 1/).length).toBeGreaterThan(0);
  });

  it('edits a manual reading and only offers delete for a synced one', () => {
    mockRange([
      reading({ id: 'v2', manual: false, at: 1, systolic: 150, diastolic: 95 }),
      reading(),
    ]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const navigate = (navigation as unknown as { navigate: jest.Mock })
      .navigate;
    const { getAllByText, getByText } = render(
      <BloodPressureScreen navigation={navigation} route={route} />
    );

    // A synced reading cannot be edited, only deleted.
    fireEvent.press(getByText(/150\/95/));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent(getByText(/150\/95/), 'longPress');
    expect(alertSpy).toHaveBeenCalled();

    // The latest card shows the same numbers first; the list row is last.
    const matches = getAllByText(/138\/86/);
    const row = matches[matches.length - 1];
    if (!row) throw new Error('Expected the list row');
    fireEvent.press(row);
    expect(navigate).toHaveBeenCalledWith(
      'BloodPressureAdd',
      expect.objectContaining({
        reading: expect.objectContaining({ id: 'v1', systolic: 138 }),
      })
    );
  });
});
