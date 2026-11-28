import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ImmunizationsScreen from '../../src/screens/ImmunizationsScreen';
import { useImmunizations } from '../../src/hooks/useImmunizations';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useImmunizations', () => ({
  useImmunizations: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: undefined } as never;

const record = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  user_id: 'u1',
  vaccine_name: 'Influenza (flu)',
  vaccine_code: null,
  administered_on: '2020-10-01',
  dose_number: null,
  lot_number: null,
  administered_by: 'Walgreens',
  site: null,
  next_due_on: null,
  notes: null,
  source: 'manual',
  created_at: '2020-10-01T10:00:00.000Z',
  updated_at: '2020-10-01T10:00:00.000Z',
  ...over,
});

const state = (over: Record<string, unknown> = {}) =>
  jest.mocked(useImmunizations).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...over,
  } as never);

describe('ImmunizationsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the empty state and offers to add one', () => {
    state();
    const screen = render(
      <ImmunizationsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText(/No immunizations yet/)).toBeTruthy();
    fireEvent.press(screen.getByText('Add immunization'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('ImmunizationForm', {});
  });

  it('shows a load failure with a retry, not an empty list', () => {
    const refetch = jest.fn();
    state({ data: undefined, isError: true, refetch });
    const screen = render(
      <ImmunizationsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('Could not load your immunizations.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('lists records, marks a past next-due date overdue and opens one to edit', () => {
    const overdue = record({ next_due_on: '2021-10-01' });
    state({
      data: [
        overdue,
        record({ id: 'i2', vaccine_name: 'Tdap', dose_number: 2 }),
      ],
    });
    const screen = render(
      <ImmunizationsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('Tdap · Dose 2')).toBeTruthy();
    expect(screen.getByText(/^Overdue/)).toBeTruthy();
    fireEvent.press(screen.getByText('Influenza (flu)'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('ImmunizationForm', { immunization: overdue });
  });
});
