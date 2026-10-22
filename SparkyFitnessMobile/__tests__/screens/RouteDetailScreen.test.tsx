import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import type { Route } from '@workspace/shared';
import RouteDetailScreen from '../../src/screens/RouteDetailScreen';
import {
  removeRoute,
  renameRoute,
  shareRouteGpx,
  useRoute,
  useRouteRuns,
} from '../../src/services/routeService';
import { openRunEntry } from '../../src/services/openRunEntry';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/routeService', () => ({
  useRoute: jest.fn(),
  useRouteRuns: jest.fn(),
  renameRoute: jest.fn(),
  removeRoute: jest.fn(),
  shareRouteGpx: jest.fn(),
}));
jest.mock('../../src/services/openRunEntry', () => ({
  openRunEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/components/exerciseStats/RouteMap', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ points }: { points: unknown[] }) => (
      <View testID="route-map" accessibilityHint={String(points.length)} />
    ),
  };
});
const mockHeader = jest.fn();
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeader(options);
    return null;
  },
}));
let mockUnit = 'km';
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: mockUnit } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockCanShowMap = true;
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: () => mockCanShowMap,
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const route = (overrides: Partial<Route> = {}): Route => ({
  id: 'r1',
  name: 'Loop',
  activity: 'run',
  source: 'drawn',
  distanceM: 5000,
  elevationGainM: 120,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  cues: [],
  sourceExerciseEntryId: null,
  runCount: 0,
  bestDurationSeconds: null,
  lastRunDate: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...overrides,
});

const refetch = jest.fn();
const goBack = jest.fn();
const navigate = jest.fn();
const show = (state: Partial<ReturnType<typeof useRoute>> = {}) =>
  (useRoute as jest.Mock).mockReturnValue({
    route: route(),
    isLoading: false,
    isError: false,
    refetch,
    ...state,
  });
const renderScreen = () =>
  render(
    <RouteDetailScreen
      {...({
        navigation: { goBack, navigate },
        route: { key: 'k', name: 'RouteDetail', params: { id: 'r1' } },
      } as unknown as RootStackScreenProps<'RouteDetail'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockUnit = 'km';
  show();
  jest.mocked(useRouteRuns).mockReturnValue({
    runs: [],
    isLoading: false,
    isError: false,
    refetch,
  });
});

describe('RouteDetailScreen', () => {
  it('shows the map, distance and climb', () => {
    const screen = renderScreen();
    expect(screen.getByTestId('route-map').props.accessibilityHint).toBe('2');
    expect(screen.getByText('5.00 km · 120 m climb')).toBeTruthy();
  });

  it('uses miles and feet when that is the unit', () => {
    mockUnit = 'miles';
    const screen = renderScreen();
    expect(screen.getByText('3.11 mi · 394 ft climb')).toBeTruthy();
  });

  it('leaves out the climb when the route has no altitude', () => {
    show({ route: route({ elevationGainM: null }) });
    const screen = renderScreen();
    expect(screen.getByText('5.00 km')).toBeTruthy();
  });

  it('retries a failed load', () => {
    show({ route: undefined, isError: true });
    const screen = renderScreen();
    expect(screen.getByText('Could not load this route.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows only a spinner while loading', () => {
    show({ route: undefined, isLoading: true });
    const screen = renderScreen();
    expect(screen.queryByText('Could not load this route.')).toBeNull();
    expect(screen.queryByTestId('route-map')).toBeNull();
  });

  describe('renaming', () => {
    const startRename = (screen: ReturnType<typeof renderScreen>) => {
      fireEvent.press(screen.getByText('Rename'));
      return screen.getByLabelText('Route name');
    };

    it('saves the trimmed name', async () => {
      (renameRoute as jest.Mock).mockResolvedValue(route({ name: 'Hill' }));
      const screen = renderScreen();
      fireEvent.changeText(startRename(screen), '  Hill  ');
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() =>
        expect(renameRoute).toHaveBeenCalledWith('r1', { name: 'Hill' })
      );
      await waitFor(() => expect(screen.getByText('Rename')).toBeTruthy());
    });

    it('does not save a blank name', () => {
      const screen = renderScreen();
      fireEvent.changeText(startRename(screen), '   ');
      fireEvent.press(screen.getByText('Save'));
      expect(renameRoute).not.toHaveBeenCalled();
    });

    it('can be cancelled without saving', () => {
      const screen = renderScreen();
      fireEvent.changeText(startRename(screen), 'Other');
      fireEvent.press(screen.getByText('Cancel'));
      expect(renameRoute).not.toHaveBeenCalled();
      expect(screen.getByText('Loop')).toBeTruthy();
      expect(screen.queryByLabelText('Route name')).toBeNull();
    });

    it('keeps the editor open and says so when saving fails', async () => {
      (renameRoute as jest.Mock).mockRejectedValue(new Error('offline'));
      const screen = renderScreen();
      fireEvent.changeText(startRename(screen), 'Hill');
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() =>
        expect(Toast.show).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error', text1: 'Could not rename' })
        )
      );
      expect(screen.getByLabelText('Route name').props.value).toBe('Hill');
    });
  });

  describe('sharing', () => {
    it('shares the route as GPX', async () => {
      (shareRouteGpx as jest.Mock).mockResolvedValue(true);
      const screen = renderScreen();
      fireEvent.press(screen.getByText('Share as GPX'));
      await waitFor(() => expect(shareRouteGpx).toHaveBeenCalled());
      expect(Toast.show).not.toHaveBeenCalled();
    });

    it('says so when sharing fails', async () => {
      (shareRouteGpx as jest.Mock).mockRejectedValue(new Error('no space'));
      const screen = renderScreen();
      fireEvent.press(screen.getByText('Share as GPX'));
      await waitFor(() =>
        expect(Toast.show).toHaveBeenCalledWith(
          expect.objectContaining({ text1: 'Could not share the route' })
        )
      );
    });
  });

  describe('deleting', () => {
    const confirmDelete = (screen: ReturnType<typeof renderScreen>) => {
      const alert = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);
      fireEvent.press(screen.getByText('Delete'));
      const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
      return buttons;
    };

    it('asks first, and does nothing if cancelled', () => {
      const screen = renderScreen();
      const buttons = confirmDelete(screen);
      expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
      expect(removeRoute).not.toHaveBeenCalled();
    });

    it('deletes and goes back once confirmed', async () => {
      (removeRoute as jest.Mock).mockResolvedValue(undefined);
      const screen = renderScreen();
      confirmDelete(screen)[1]?.onPress?.();
      await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
      expect(removeRoute).toHaveBeenCalledWith('r1');
    });

    it('stays on the route and says so when the delete fails', async () => {
      (removeRoute as jest.Mock).mockRejectedValue(new Error('offline'));
      const screen = renderScreen();
      confirmDelete(screen)[1]?.onPress?.();
      await waitFor(() =>
        expect(Toast.show).toHaveBeenCalledWith(
          expect.objectContaining({ text1: 'Could not delete the route' })
        )
      );
      expect(goBack).not.toHaveBeenCalled();
    });
  });

  it('offers Edit route on map only where a real map can be drawn', () => {
    show();
    mockCanShowMap = true;
    const withMap = renderScreen();
    expect(withMap.getByText('Edit route on map')).toBeTruthy();
    withMap.unmount();

    mockCanShowMap = false;
    const withoutMap = renderScreen();
    expect(withoutMap.queryByText('Edit route on map')).toBeNull();
    mockCanShowMap = true;
  });
});

describe('RouteDetailScreen history', () => {
  const runs = [
    {
      entryId: 'e3',
      date: '2026-10-16',
      durationSeconds: 1450,
      distanceM: 5000,
      paceSecPerKm: 290,
      avgHeartRate: 151,
    },
    {
      entryId: 'e2',
      date: '2026-10-09',
      durationSeconds: 1500,
      distanceM: null,
      paceSecPerKm: null,
      avgHeartRate: null,
    },
    {
      entryId: 'e1',
      date: '2026-10-02',
      durationSeconds: 1510,
      distanceM: 5000,
      paceSecPerKm: 302,
      avgHeartRate: null,
    },
  ];
  const withRuns = () => {
    show({
      route: route({
        runCount: 3,
        bestDurationSeconds: 1450,
        lastRunDate: '2026-10-16',
      }),
    });
    jest.mocked(useRouteRuns).mockReturnValue({
      runs,
      isLoading: false,
      isError: false,
      refetch,
    });
  };

  it('says there are no runs yet', () => {
    const screen = renderScreen();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
    expect(screen.queryByTestId('route-history-count')).toBeNull();
    expect(screen.queryByTestId('route-history-trend')).toBeNull();
  });

  it('shows the count, best time, last run, trend and the runs', () => {
    withRuns();
    const screen = renderScreen();
    expect(screen.getByTestId('route-history-count').props.children).toBe(3);
    expect(screen.getByTestId('route-history-best').props.children).toBe(
      '24:10'
    );
    expect(screen.getByTestId('route-history-last')).toBeTruthy();
    expect(screen.getByText(/faster than your recent runs/)).toBeTruthy();
    expect(
      screen.getByText('24:10 · 5.00 km · 4:50 /km · 151 bpm')
    ).toBeTruthy();
    expect(screen.getByTestId('route-run-e1')).toBeTruthy();
  });

  it('opens the entry of a run', async () => {
    withRuns();
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('route-run-e2'));
    await waitFor(() =>
      expect(openRunEntry).toHaveBeenCalledWith(
        expect.objectContaining({ goBack }),
        'e2',
        'km'
      )
    );
  });

  it('says so when a run cannot be opened', async () => {
    withRuns();
    jest.mocked(openRunEntry).mockRejectedValueOnce(new Error('gone'));
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('route-run-e2'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Could not open that run' })
      )
    );
  });

  it('starts a phone run over the route, but not for a ride', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Record a run on this route'));
    expect(navigate).toHaveBeenCalledWith('RecordActivity', { routeId: 'r1' });
    screen.unmount();

    show({ route: route({ activity: 'ride' }) });
    const ride = renderScreen();
    expect(ride.queryByText('Record a run on this route')).toBeNull();
  });
});
