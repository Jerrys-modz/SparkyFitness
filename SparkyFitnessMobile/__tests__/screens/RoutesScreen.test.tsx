import React from 'react';
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';
import RoutesScreen from '../../src/screens/RoutesScreen';
import { useRoutes } from '../../src/services/routeService';
import { canShowRouteMap } from '../../src/utils/routeMapSupport';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/routeService', () => ({
  useRoutes: jest.fn(),
  pickAndImportGpx: jest.fn(),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: jest.fn(),
}));
const mockHeader = jest.fn();
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeader(options);
    return null;
  },
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: () => undefined,
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));

const navigate = jest.fn();
const renderScreen = () =>
  render(
    <RoutesScreen
      {...({
        navigation: { navigate },
      } as unknown as RootStackScreenProps<'Routes'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  jest.clearAllMocks();
  (useRoutes as jest.Mock).mockReturnValue({
    routes: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
});

const openAddMenu = (): string[] => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  renderScreen();
  const header = mockHeader.mock.calls.at(-1)?.[0] as {
    right: { onPress: () => void };
  };
  header.right.onPress();
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  return buttons.map((b) => b.text ?? '');
};

describe('RoutesScreen add menu', () => {
  it('offers drawing on a map when this build can show one', () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(true);
    expect(openAddMenu()).toContain('Draw on a map');
  });

  it('hides drawing where the map would render blank, but keeps importing', () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(false);
    const labels = openAddMenu();
    expect(labels).not.toContain('Draw on a map');
    expect(labels).toContain('Import a GPX file');
  });
});
