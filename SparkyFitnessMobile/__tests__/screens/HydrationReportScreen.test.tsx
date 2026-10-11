import React from 'react';
import { render } from '@testing-library/react-native';

import HydrationReportScreen from '../../src/screens/HydrationReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { buildHydrationInsights } from '../../src/utils/hydrationReport';

const mockUseHydrationReport = jest.fn();
jest.mock('../../src/hooks/useHydrationReport', () => ({
  useHydrationReport: (args: unknown) => mockUseHydrationReport(args),
}));
jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({ isConnected: true }),
  usePreferences: () => ({ preferences: { water_display_unit: 'ml' } }),
}));
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
jest.mock('../../src/components/HydrationBarChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="hydration-chart" /> };
});

const series = [
  { day: '2026-10-05', milliliters: 2200 },
  { day: '2026-10-06', milliliters: 1500 },
  { day: '2026-10-07', milliliters: 2000 },
];
const goals = [2000, 2000, 2000];

const renderScreen = () =>
  render(
    <HydrationReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('HydrationReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseHydrationReport.mockReset();
    mockUseHydrationReport.mockReturnValue({
      report: {
        series,
        goals,
        insights: buildHydrationInsights(series, [], goals),
      },
      isLoading: false,
      isError: false,
    });
  });

  it('shows the key figures, chart and every card by default', () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId('hydration-highlight-average')).toBeTruthy();
    expect(getByTestId('hydration-highlight-goals')).toBeTruthy();
    expect(getByTestId('hydration-chart')).toBeTruthy();
    expect(getByTestId('hydration-goal-average')).toBeTruthy();
    expect(getByTestId('hydration-best-day')).toBeTruthy();
    expect(getByTestId('hydration-weekday-1')).toBeTruthy();
  });

  it('leaves out the sections turned off in Customize Reports', () => {
    useAppPreferencesStore.setState({
      hiddenReportSections: ['hydration.chart', 'hydration.goal'],
    });

    const { queryByTestId, getByTestId } = renderScreen();

    expect(queryByTestId('hydration-chart')).toBeNull();
    expect(queryByTestId('hydration-goal-average')).toBeNull();
    expect(getByTestId('hydration-best-day')).toBeTruthy();
  });

  it('says so when no water was logged', () => {
    mockUseHydrationReport.mockReturnValue({
      report: {
        series: [{ day: '2026-10-05', milliliters: 0 }],
        goals: [2000],
        insights: buildHydrationInsights(
          [{ day: '2026-10-05', milliliters: 0 }],
          [],
          [2000]
        ),
      },
      isLoading: false,
      isError: false,
    });

    const { getByText, queryByTestId } = renderScreen();

    expect(getByText('No water logged in this period')).toBeTruthy();
    expect(queryByTestId('hydration-highlight-average')).toBeNull();
  });
});
