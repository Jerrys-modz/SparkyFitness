import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import ReportsSettingsScreen from '../../src/screens/ReportsSettingsScreen';
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

const renderScreen = () =>
  render(
    <ReportsSettingsScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^reports-report-row-/)
    .map((row) => String(row.props.testID).replace('reports-report-row-', ''));

describe('ReportsSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  test('lists the reports in the saved order, adding ones it lacks', () => {
    useAppPreferencesStore.setState({ reportOrder: ['mood', 'nutrition'] });

    renderScreen();

    expect(orderedRowKeys()).toEqual([
      'mood',
      'nutrition',
      'hydration',
      'sleep',
      'measurements',
      'exercise',
    ]);
  });

  test('toggling a report hides and shows it', () => {
    renderScreen();

    const sleepSwitch = screen.getByTestId('reports-report-switch-sleep');
    fireEvent(sleepSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenReports).toEqual(['sleep']);

    fireEvent(sleepSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenReports).toEqual([]);
  });

  test('the last report still shown cannot be turned off', () => {
    useAppPreferencesStore.setState({
      hiddenReports: [
        'nutrition',
        'hydration',
        'sleep',
        'measurements',
        'mood',
      ],
    });

    renderScreen();

    expect(
      screen.getByTestId('reports-report-switch-exercise').props.disabled
    ).toBe(true);
    expect(
      screen.getByTestId('reports-report-switch-mood').props.disabled
    ).toBe(false);
  });

  test('changes the default range', () => {
    renderScreen();

    fireEvent.press(screen.getByText('7d'));

    expect(useAppPreferencesStore.getState().reportDefaultRange).toBe('7d');
  });

  test('turning a section off hides it, turning it on shows it again', () => {
    renderScreen();

    const stages = screen.getByTestId('reports-section-sleep.stages');
    fireEvent(stages, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenReportSections).toEqual([
      'sleep.stages',
    ]);

    fireEvent(stages, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenReportSections).toEqual([]);
  });

  test('every sleep chart has its own switch', () => {
    renderScreen();

    expect(screen.getByTestId('reports-section-sleep.metric.hrv')).toBeTruthy();
    expect(
      screen.getByTestId('reports-section-sleep.metric.bodyBattery')
    ).toBeTruthy();
  });

  test('every report with sections has its own switches', () => {
    renderScreen();

    expect(
      screen.getByTestId('reports-section-nutrition.weekdays')
    ).toBeTruthy();
    expect(screen.getByTestId('reports-section-hydration.goal')).toBeTruthy();
    expect(
      screen.getByTestId('reports-section-measurements.tape')
    ).toBeTruthy();
    expect(
      screen.getByTestId('reports-section-sleep.weekendVsWeekday')
    ).toBeTruthy();
  });
});
