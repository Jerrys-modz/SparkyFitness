import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RoutesScreen from '../../src/screens/RoutesScreen';
import { useRoutes } from '../../src/services/routeService';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

const summary = (id: string, name: string, runCount: number) => ({
  id,
  name,
  activity: 'run',
  source: 'drawn',
  distanceM: 5000,
  elevationGainM: null,
  sourceExerciseEntryId: null,
  runCount,
  bestDurationSeconds: runCount > 0 ? 1500 : null,
  lastRunDate: runCount > 0 ? '2026-10-16' : null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  start: null,
  pointCount: 2,
});

jest.mock('../../src/services/routeService', () => ({
  useRoutes: jest.fn(),
  useRouteGenerationAvailable: () => ({ available: false, isLoading: false }),
  pickAndImportGpx: jest.fn(),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useWatchRouteStatus', () => ({
  useWatchRouteStatuses: () => () => 'none',
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const props = {
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
  route: { key: 'Routes', name: 'Routes' },
} as unknown as RootStackScreenProps<'Routes'>;

describe('RoutesScreen run counts', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('says how many times a route was run, and nothing for a new one', () => {
    jest.mocked(useRoutes).mockReturnValue({
      routes: [
        summary('a', 'Hill loop', 3),
        summary('b', 'River path', 1),
        summary('c', 'New route', 0),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const screen = render(<RoutesScreen {...props} />);
    expect(screen.getByText(/Ran 3 times/)).toBeTruthy();
    expect(screen.getByText(/Ran 1 time$/)).toBeTruthy();
    expect(screen.getAllByText(/Ran \d+ time/)).toHaveLength(2);
  });
});

describe('RoutesScreen links', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('opens Segments and the Heatmap, even before any route exists', () => {
    jest.mocked(useRoutes).mockReturnValue({
      routes: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const screen = render(<RoutesScreen {...props} />);
    fireEvent.press(screen.getByTestId('routes-segments-link'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('Segments');
    fireEvent.press(screen.getByTestId('routes-heatmap-link'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('Heatmap');
  });
});
