import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import WidgetsScreen from '../../src/screens/WidgetsScreen';
import { useWidgetLayoutStore } from '../../src/stores/widgetLayoutStore';
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

let mockIdCounter = 0;
jest.mock('../../src/utils/ids', () => ({
  newUuid: () => `id-${++mockIdCounter}`,
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <WidgetsScreen {...({ navigation, route: { params: {} } } as never)} />
  );

describe('WidgetsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdCounter = 0;
    useWidgetLayoutStore.setState({ layouts: [] });
  });

  it('invites the first widget when there are none', () => {
    renderScreen();
    expect(screen.getByText('No widgets yet')).toBeTruthy();
    fireEvent.press(screen.getByText('New widget'));
    expect(navigation.navigate).toHaveBeenCalledWith('WidgetEditor', {});
  });

  it('explains how to add and choose a widget once there is one', () => {
    useWidgetLayoutStore.getState().addLayout({
      name: 'Macros',
      family: 'small',
      style: 'ring',
      metrics: [{ metric: 'protein' }],
    });
    renderScreen();

    expect(screen.getByText('Add a widget to your screen')).toBeTruthy();
    expect(
      screen.getByText(/It shows your first widget until you choose/)
    ).toBeTruthy();
    expect(
      screen.getByText(/tap Edit Widget, and pick the widget/)
    ).toBeTruthy();
  });

  it('does not show the steps before any widget is saved', () => {
    renderScreen();
    expect(screen.queryByText('Add a widget to your screen')).toBeNull();
  });

  it('lists saved widgets and opens one to edit', () => {
    const id = useWidgetLayoutStore.getState().addLayout({
      name: 'Macros',
      family: 'medium',
      style: 'grid',
      metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
    })!;
    renderScreen();

    expect(screen.getByText('Macros')).toBeTruthy();
    expect(screen.getByText('Medium • Grid')).toBeTruthy();
    expect(screen.getByText('Protein, Carbs')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Edit Macros' }));
    expect(navigation.navigate).toHaveBeenCalledWith('WidgetEditor', {
      layoutId: id,
    });
  });

  it('duplicates a widget and opens the copy to edit', () => {
    useWidgetLayoutStore.getState().addLayout({
      name: 'Macros',
      family: 'small',
      style: 'ring',
      metrics: [{ metric: 'protein' }],
    });
    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Duplicate Macros' }));

    const { layouts } = useWidgetLayoutStore.getState();
    expect(layouts.map((l) => l.name)).toEqual(['Macros', 'Macros copy']);
    expect(navigation.navigate).toHaveBeenCalledWith('WidgetEditor', {
      layoutId: layouts[1].id,
    });
  });

  it('deletes only after confirming', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useWidgetLayoutStore.getState().addLayout({
      name: 'Macros',
      family: 'small',
      style: 'ring',
      metrics: [{ metric: 'protein' }],
    });
    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Delete Macros' }));
    expect(useWidgetLayoutStore.getState().layouts).toHaveLength(1);

    const buttons = alert.mock.calls[0][2]!;
    act(() => {
      buttons.find((b) => b.style === 'destructive')!.onPress!();
    });
    expect(useWidgetLayoutStore.getState().layouts).toEqual([]);
    alert.mockRestore();
  });
});
