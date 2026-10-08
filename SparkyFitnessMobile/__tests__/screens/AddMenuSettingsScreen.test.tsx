import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AddMenuSettingsScreen from '../../src/screens/AddMenuSettingsScreen';
import { ADD_MENU_ITEM_KEYS } from '../../src/constants/addMenuItems';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <AddMenuSettingsScreen
      {...({ navigation, route: { params: {} } } as never)}
    />
  );

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^add-menu-row-/)
    .map((row) => String(row.props.testID).replace('add-menu-row-', ''));

describe('AddMenuSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  test('lists every row in the saved order, adding ones it lacks', () => {
    useAppPreferencesStore.setState({ addMenuOrder: ['askSparky', 'mood'] });

    renderScreen();

    const keys = orderedRowKeys();
    expect(keys.slice(0, 2)).toEqual(['askSparky', 'mood']);
    expect(keys).toHaveLength(ADD_MENU_ITEM_KEYS.length);
  });

  test('toggling a row hides and shows it', () => {
    renderScreen();

    const moodSwitch = screen.getByTestId('add-menu-switch-mood');
    fireEvent(moodSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenAddMenuItems).toEqual([
      'mood',
    ]);

    fireEvent(moodSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenAddMenuItems).toEqual([]);
  });

  test('reordering a row updates the saved order', () => {
    renderScreen();

    fireEvent(
      screen.getByTestId('add-menu-drag-handle-recordActivity'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );

    expect(useAppPreferencesStore.getState().addMenuOrder.slice(0, 2)).toEqual([
      'progressPhotos',
      'recordActivity',
    ]);
  });

  test('reset puts the order and hidden rows back', () => {
    useAppPreferencesStore.setState({
      addMenuOrder: ['syncHealth'],
      hiddenAddMenuItems: ['mood'],
    });
    renderScreen();

    fireEvent.press(screen.getByTestId('add-menu-reset'));

    const state = useAppPreferencesStore.getState();
    expect(state.addMenuOrder).toEqual([...ADD_MENU_ITEM_KEYS]);
    expect(state.hiddenAddMenuItems).toEqual([]);
  });
});
