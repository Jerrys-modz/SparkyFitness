import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardSettingsScreen from '../../src/screens/DashboardSettingsScreen';
import { initializeI18n } from '../../src/localization/i18n';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { DASHBOARD_CARD_KEYS } from '../../src/constants/dashboardCards';

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(() => ({
    isConnected: false,
    isLoading: false,
  })),
  useCustomNutrients: jest.fn(() => ({
    customNutrients: [],
    isLoading: false,
  })),
  useNutrientDisplayPreferences: jest.fn(() => ({
    preferences: [],
    isLoading: false,
  })),
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

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <DashboardSettingsScreen
          {...({ navigation, route: { params: {} } } as never)}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^dashboard-card-row-/)
    .map((row) => String(row.props.testID).replace('dashboard-card-row-', ''));

describe('DashboardSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  const moveRow = (cardKey: string, actionName: 'increment' | 'decrement') =>
    fireEvent(
      screen.getByTestId(`dashboard-card-drag-handle-${cardKey}`),
      'accessibilityAction',
      { nativeEvent: { actionName } }
    );

  test('with tabs off, renders every dashboard card in the order from the store', () => {
    useAppPreferencesStore.getState().setDashboardTabsEnabled(false);
    renderScreen();

    expect(orderedRowKeys()).toEqual([...DASHBOARD_CARD_KEYS]);
  });

  test('the Health Trends configure button navigates to HealthTrendsSettings', () => {
    renderScreen();

    const configureBtn = screen.getByTestId(
      'dashboard-card-configure-healthTrends'
    );
    expect(configureBtn).toBeTruthy();

    fireEvent.press(configureBtn);
    expect(navigation.navigate).toHaveBeenCalledWith('HealthTrendsSettings');
  });

  test('toggling a card switch updates its visibility in appPreferencesStore', () => {
    renderScreen();

    const hydrationSwitch = screen.getByTestId(
      'dashboard-card-switch-hydration'
    );
    expect(hydrationSwitch.props.value).toBe(true);

    fireEvent(hydrationSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hydrationCardVisible).toBe(false);

    fireEvent(hydrationSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hydrationCardVisible).toBe(true);
  });

  test('with tabs off, reordering cards updates dashboardCardOrder in the store', () => {
    useAppPreferencesStore.getState().setDashboardTabsEnabled(false);
    renderScreen();

    moveRow('calorieRing', 'increment');

    const state = useAppPreferencesStore.getState();
    expect(state.dashboardCardOrder[0]).toBe('pinnedMetrics');
    expect(state.dashboardCardOrder[1]).toBe('calorieRing');
  });

  test('the tabs switch turns the Dashboard tabs off and on', () => {
    renderScreen();

    const tabsSwitch = screen.getByTestId('dashboard-tabs-switch');
    expect(tabsSwitch.props.value).toBe(true);

    fireEvent(tabsSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().dashboardTabsEnabled).toBe(false);

    fireEvent(tabsSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().dashboardTabsEnabled).toBe(true);
  });

  describe('with tabs on', () => {
    const summaryRowKeys = (): string[] =>
      screen
        .queryAllByTestId(/^dashboard-summary-card-row-/)
        .map((row) =>
          String(row.props.testID).replace('dashboard-summary-card-row-', '')
        );

    test('shows one section per tab, each card once under its own tab', () => {
      renderScreen();

      for (const tab of ['summary', 'nutrition', 'activity', 'wellness']) {
        expect(screen.getByTestId(`dashboard-tab-section-${tab}`)).toBeTruthy();
      }
      // Summary lists only its own cards, all switched on.
      expect(summaryRowKeys()).toEqual([
        'calorieRing',
        'pinnedMetrics',
        'medications',
        'macros',
        'trainingLoad',
        'sparkySummary',
        'coachMessages',
      ]);
      // At a Glance lives on Summary, so its switch is its (opt-in) visibility.
      // Sparky Summary and Coach Messages are opt-in the same way.
      const optIn = ['pinnedMetrics', 'sparkySummary', 'coachMessages'];
      for (const key of summaryRowKeys().filter((k) => !optIn.includes(k))) {
        expect(
          screen.getByTestId(`dashboard-summary-card-switch-${key}`).props.value
        ).toBe(true);
      }
      // Every other card can be added from the list under it.
      expect(
        screen.getByTestId('dashboard-summary-add-hydration')
      ).toBeTruthy();
      expect(screen.queryByTestId('dashboard-summary-add-macros')).toBeNull();
      // Summary-only cards (At a Glance, Sparky Summary, Coach Messages) and Ask
      // Sparky have no home tab section.
      expect(orderedRowKeys()).toHaveLength(DASHBOARD_CARD_KEYS.length - 4);
      expect(orderedRowKeys()).not.toContain('askSparky');
    });

    test('adding a card to Summary keeps it on its own tab', () => {
      renderScreen();

      fireEvent.press(screen.getByTestId('dashboard-summary-add-hydration'));

      const state = useAppPreferencesStore.getState();
      expect(state.dashboardSummaryCards).toContain('hydration');
      expect(state.hydrationCardVisible).toBe(true);
    });

    test('taking a card off Summary does not hide it on its own tab', () => {
      renderScreen();

      fireEvent(
        screen.getByTestId('dashboard-summary-card-switch-calorieRing'),
        'valueChange',
        false
      );

      const state = useAppPreferencesStore.getState();
      expect(state.dashboardSummaryCards).not.toContain('calorieRing');
      expect(state.calorieRingCardVisible).toBe(true);
    });

    test('reordering a tab saves that tab’s own order', () => {
      renderScreen();

      moveRow('calorieRing', 'increment');

      const state = useAppPreferencesStore.getState();
      expect(state.dashboardTabCardOrders.nutrition?.slice(0, 2)).toEqual([
        'macros',
        'calorieRing',
      ]);
      expect(state.dashboardCardOrder[0]).toBe('calorieRing');
    });

    test('Ask Sparky has one switch for every tab', () => {
      renderScreen();

      fireEvent(
        screen.getByTestId('dashboard-ask-sparky-switch'),
        'valueChange',
        false
      );

      expect(useAppPreferencesStore.getState().askSparkyVisible).toBe(false);
    });
  });
});
