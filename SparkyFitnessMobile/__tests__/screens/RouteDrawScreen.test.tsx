import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteDrawScreen from '../../src/screens/RouteDrawScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false })
  ),
}));
jest.mock('../../src/services/routeService', () => ({
  saveDrawnRoute: jest.fn(() => Promise.resolve({ id: 'new' })),
  useRouteGenerationCapabilities: () => ({
    capabilities: {
      available: false,
      maxAlternatives: 1,
      style: {
        surface: false,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      },
      stops: false,
    },
    isLoading: false,
  }),
  saveRouteEdits: jest.fn(),
  useRoute: () => ({ route: undefined }),
  generateRoutePreview: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const props = {
  navigation: { replace: jest.fn(), goBack: jest.fn() },
  route: { key: 'RouteDraw', name: 'RouteDraw' },
} as unknown as RootStackScreenProps<'RouteDraw'>;

const tap = (screen: ReturnType<typeof render>, latitude: number) =>
  fireEvent(screen.getByTestId('map-view'), 'press', {
    nativeEvent: { coordinate: { latitude, longitude: -0.12 } },
  });

describe('RouteDrawScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows no elevation profile for tapped points, which carry no altitude', () => {
    const screen = render(<RouteDrawScreen {...props} />);
    tap(screen, 51.5);
    tap(screen, 51.502);
    tap(screen, 51.504);
    expect(
      screen.getAllByTestId('map-marker', { includeHiddenElements: true })
    ).toHaveLength(3);
    expect(screen.queryByTestId('route-elevation')).toBeNull();
    expect(screen.queryByText('Elevation')).toBeNull();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });
});
