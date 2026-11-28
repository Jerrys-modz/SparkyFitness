import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ImmunizationFormScreen from '../../src/screens/ImmunizationFormScreen';
import {
  useDeleteImmunization,
  useSaveImmunization,
} from '../../src/hooks/useImmunizations';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/CalendarSheet', () => 'CalendarSheet');
jest.mock('../../src/components/FormScreenChrome', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    FooterSaveBar: ({
      onPress,
      disabled,
    }: {
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="save-bar"
        accessibilityState={{ disabled: !!disabled }}
        onPress={onPress}
      >
        <Text>save</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../src/hooks/useImmunizations', () => ({
  useSaveImmunization: jest.fn(),
  useDeleteImmunization: jest.fn(),
}));

const goBack = jest.fn();
const navigation = { goBack, navigate: jest.fn() } as never;
const mutateAsync = jest.fn();

describe('ImmunizationFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutateAsync.mockResolvedValue({});
    jest
      .mocked(useSaveImmunization)
      .mockReturnValue({ mutateAsync, isPending: false } as never);
    jest
      .mocked(useDeleteImmunization)
      .mockReturnValue({ mutate: jest.fn() } as never);
  });

  it('cannot save without a vaccine name', () => {
    const screen = render(
      <ImmunizationFormScreen
        navigation={navigation}
        route={{ params: {} } as never}
      />
    );
    expect(
      screen.getByLabelText('save-bar').props.accessibilityState.disabled
    ).toBe(true);
  });

  it('saves a new record with empty optional fields as null', async () => {
    const screen = render(
      <ImmunizationFormScreen
        navigation={navigation}
        route={{ params: {} } as never}
      />
    );
    fireEvent.changeText(screen.getByLabelText('Vaccine'), 'Tdap');
    fireEvent.press(screen.getByLabelText('save-bar'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const { id, body } = mutateAsync.mock.calls[0][0];
    expect(id).toBeUndefined();
    expect(body).toMatchObject({
      vaccine_name: 'Tdap',
      dose_number: null,
      lot_number: null,
      next_due_on: null,
      source: 'manual',
    });
    expect(goBack).toHaveBeenCalled();
  });

  it('blocks an out-of-range dose number', () => {
    const screen = render(
      <ImmunizationFormScreen
        navigation={navigation}
        route={{ params: {} } as never}
      />
    );
    fireEvent.changeText(screen.getByLabelText('Vaccine'), 'Tdap');
    fireEvent.changeText(screen.getByLabelText('Dose number'), '25');
    expect(screen.getByText('Dose number must be from 1 to 20.')).toBeTruthy();
    expect(
      screen.getByLabelText('save-bar').props.accessibilityState.disabled
    ).toBe(true);
  });

  it('edits a saved record by id', async () => {
    const immunization = {
      id: 'i1',
      user_id: 'u1',
      vaccine_name: 'MMR',
      vaccine_code: null,
      administered_on: '2020-05-04',
      dose_number: 1,
      lot_number: null,
      administered_by: null,
      site: null,
      next_due_on: null,
      notes: null,
      source: 'import',
      created_at: '2020-05-04T10:00:00.000Z',
      updated_at: '2020-05-04T10:00:00.000Z',
    };
    const screen = render(
      <ImmunizationFormScreen
        navigation={navigation}
        route={{ params: { immunization } } as never}
      />
    );
    fireEvent.changeText(screen.getByLabelText('Lot number'), 'AB1');
    fireEvent.press(screen.getByLabelText('save-bar'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const { id, body } = mutateAsync.mock.calls[0][0];
    expect(id).toBe('i1');
    expect(body).toMatchObject({
      vaccine_name: 'MMR',
      dose_number: 1,
      lot_number: 'AB1',
      source: 'import',
    });
  });
});
