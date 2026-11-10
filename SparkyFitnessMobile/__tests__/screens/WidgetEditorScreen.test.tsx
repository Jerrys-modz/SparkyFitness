import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';

import WidgetEditorScreen from '../../src/screens/WidgetEditorScreen';
import { useWidgetLayoutStore } from '../../src/stores/widgetLayoutStore';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

let mockIdCounter = 0;
jest.mock('../../src/utils/ids', () => ({
  newUuid: () => `id-${++mockIdCounter}`,
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderEditor = (params?: { layoutId?: string }) =>
  render(
    <WidgetEditorScreen {...({ navigation, route: { params } } as never)} />
  );

const press = (name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));

const selected = (name: string): boolean =>
  screen.getByRole('button', { name }).props.accessibilityState.selected;

describe('WidgetEditorScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdCounter = 0;
    useWidgetLayoutStore.setState({ layouts: [] });
  });

  it('saves a new widget with the typed name and goes back', () => {
    renderEditor();
    fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Morning macros'),
      '  Morning  '
    );
    press('Medium');
    press('Protein');
    press('Save');

    const [layout] = useWidgetLayoutStore.getState().layouts;
    // Medium also allows the ring the small widget started with, so it stays.
    expect(layout).toMatchObject({
      name: 'Morning',
      family: 'medium',
      style: 'ring',
    });
    expect(layout.metrics.map((m) => m.metric)).toEqual([
      'calories_remaining',
      'protein',
    ]);
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('asks for a name instead of saving without one', () => {
    renderEditor();
    press('Save');

    expect(useWidgetLayoutStore.getState().layouts).toEqual([]);
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Name your widget' })
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('only offers styles the chosen size can show', () => {
    renderEditor();
    // Small: ring, big number, bars.
    expect(screen.queryByRole('button', { name: 'Grid' })).toBeNull();

    press('Lock Screen line');
    expect(screen.getByRole('button', { name: 'Big number' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ring' })).toBeNull();
    expect(selected('Big number')).toBe(true);
  });

  it('stops adding numbers once the size is full', () => {
    renderEditor();
    // Small fits two: one is chosen already.
    press('Protein');
    const carbs = screen.getByRole('button', { name: 'Carbs' });
    expect(carbs.props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText('Pick up to 2 for this size. 2 chosen.')
    ).toBeTruthy();
  });

  it('keeps at least one number', () => {
    renderEditor();
    press('Calories left');
    expect(selected('Calories left')).toBe(true);
  });

  it('saves a renamed number and ignores a blank one', () => {
    renderEditor();
    fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Morning macros'),
      'Macros'
    );
    press('Medium');
    press('Protein');
    fireEvent.changeText(screen.getByLabelText('Name for Protein'), '  P  ');
    fireEvent.changeText(screen.getByLabelText('Name for Calories left'), '  ');
    press('Save');

    const [layout] = useWidgetLayoutStore.getState().layouts;
    expect(layout.metrics).toEqual([
      { metric: 'calories_remaining' },
      { metric: 'protein', label: 'P' },
    ]);
  });

  it('starts a new widget from a template', () => {
    renderEditor();
    press('Macros');
    press('Save');

    const [layout] = useWidgetLayoutStore.getState().layouts;
    expect(layout).toMatchObject({
      name: 'Macros',
      family: 'medium',
      style: 'bars',
    });
    expect(layout.metrics.map((m) => m.metric)).toEqual([
      'protein',
      'carbs',
      'fat',
    ]);
  });

  it('does not offer templates when editing an existing widget', () => {
    const id = useWidgetLayoutStore.getState().addLayout({
      name: 'Old',
      family: 'small',
      style: 'ring',
      metrics: [{ metric: 'water' }],
    })!;
    renderEditor({ layoutId: id });
    expect(screen.queryByText('Start from a template')).toBeNull();
  });

  it('edits an existing widget in place', () => {
    const id = useWidgetLayoutStore.getState().addLayout({
      name: 'Old',
      family: 'small',
      style: 'ring',
      metrics: [{ metric: 'water' }],
    })!;
    renderEditor({ layoutId: id });

    fireEvent.changeText(screen.getByDisplayValue('Old'), 'New');
    press('Save');

    const { layouts } = useWidgetLayoutStore.getState();
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ id, name: 'New' });
    expect(layouts[0].metrics).toEqual([{ metric: 'water' }]);
  });
});
