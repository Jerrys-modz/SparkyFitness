import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ROUTE_FOLLOW_ROADS_MAX_POINTS,
  type GeneratedRoutePreview,
} from '@workspace/shared';
import RouteDrawScreen from '../../src/screens/RouteDrawScreen';
import {
  generateRoutePreview,
  saveDrawnRoute,
  useRouteGenerationCapabilities,
} from '../../src/services/routeService';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { FOLLOW_ROADS_DEBOUNCE_MS } from '../../src/hooks/useFollowRoadsRoute';
import { ApiError } from '../../src/services/api/errors';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getLastKnownPositionAsync: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/services/routeService', () => ({
  generateRoutePreview: jest.fn(),
  saveDrawnRoute: jest.fn(),
  useRouteGenerationCapabilities: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockCapabilities = useRouteGenerationCapabilities as jest.Mock;

const NO_STYLE = {
  surface: false,
  hilliness: false,
  avoidSteps: false,
  avoidBusyRoads: false,
};
const caps = (available: boolean, style: typeof NO_STYLE = NO_STYLE) => ({
  capabilities: {
    available,
    maxAlternatives: 1,
    style,
    stops: false,
  },
  isLoading: false,
});
const mockGenerate = generateRoutePreview as jest.Mock;
const mockSave = saveDrawnRoute as jest.Mock;
const mockHeader = useScreenHeader as jest.Mock;

const snapped: GeneratedRoutePreview = {
  name: 'Generated',
  activity: 'run',
  source: 'generated',
  points: [
    { lat: 40, lon: -100 },
    { lat: 40.002, lon: -100.001 },
    { lat: 40.004, lon: -100 },
  ],
  cues: [
    { index: 0, kind: 'depart' },
    { index: 1, kind: 'left', distanceM: 200 },
    { index: 2, kind: 'right', distanceM: 400 },
  ],
  distanceM: 650,
  elevationGainM: null,
};

const navigation = { replace: jest.fn() };

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <RouteDrawScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'RouteDraw' } as never}
      />
    </SafeAreaProvider>
  );
}

const tapMap = (
  utils: ReturnType<typeof renderScreen>,
  latitude: number,
  longitude = -100
) =>
  act(() =>
    utils.getByTestId('map-view').props.onPress({
      nativeEvent: { coordinate: { latitude, longitude } },
    })
  );
const settle = async (ms = FOLLOW_ROADS_DEBOUNCE_MS) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => undefined);
};
const lastHeader = () => mockHeader.mock.calls.at(-1)?.[0];

describe('RouteDrawScreen follow roads', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCapabilities.mockReturnValue(caps(true));
  });
  afterEach(() => jest.useRealTimers());

  it('keeps working as before without a routing engine', () => {
    mockCapabilities.mockReturnValue(caps(false));
    const utils = renderScreen();
    expect(utils.queryByText('Follow roads')).toBeNull();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    expect(utils.getAllByTestId('map-polyline')).toHaveLength(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('keeps straight lines with the toggle off', async () => {
    const utils = renderScreen();
    expect(utils.getByText('Follow roads')).toBeTruthy();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    await settle(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(2);
  });

  it('sends the taps as ordered waypoints and draws the engine line', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.002, -100.001);
    tapMap(utils, 40.004);
    expect(mockGenerate).not.toHaveBeenCalled();

    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'waypoints',
      start: { lat: 40, lon: -100 },
      waypoints: [
        { lat: 40.002, lon: -100.001 },
        { lat: 40.004, lon: -100 },
      ],
    });
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(
      snapped.points.length
    );
    expect(utils.getByText(/650 m|0\.65 km/)).toBeTruthy();
    expect(utils.getByText(/2 turns/)).toBeTruthy();
  });

  it('keeps the last good line and offers a retry when a request fails', async () => {
    mockGenerate.mockResolvedValueOnce(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    await settle();

    mockGenerate.mockRejectedValueOnce(new ApiError('x', 422, '{}'));
    tapMap(utils, 40.01);
    await settle();
    expect(utils.getByText(/No route found there/)).toBeTruthy();
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(
      snapped.points.length
    );
    expect(utils.getByText('Retry')).toBeTruthy();
    // The shown line no longer matches the taps, so it cannot be saved.
    expect(lastHeader().right.disabled).toBe(true);
  });

  it('stops adding points past the waypoint limit', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    for (let i = 0; i < ROUTE_FOLLOW_ROADS_MAX_POINTS + 3; i++) {
      tapMap(utils, 40 + i * 0.001);
    }
    expect(utils.getAllByTestId('map-marker')).toHaveLength(
      ROUTE_FOLLOW_ROADS_MAX_POINTS
    );
    expect(utils.getByText(/takes up to 21 points/)).toBeTruthy();
    await settle();
    expect(mockGenerate.mock.calls.at(-1)[0].waypoints).toHaveLength(20);
  });

  it('saves the snapped line with its cues once it matches the taps', async () => {
    mockGenerate.mockResolvedValue(snapped);
    mockSave.mockResolvedValue({ id: 'route-1' });
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    fireEvent.changeText(utils.getByLabelText('Route name'), 'Park loop');
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    expect(lastHeader().right.disabled).toBe(true);
    await settle();
    expect(lastHeader().right.disabled).toBe(false);

    await act(async () => lastHeader().right.onPress());
    expect(mockSave).toHaveBeenCalledWith({
      name: 'Park loop',
      points: snapped.points,
      cues: snapped.cues,
    });
    expect(navigation.replace).toHaveBeenCalledWith('RouteDetail', {
      id: 'route-1',
    });
  });

  it('returns to straight lines when switched off', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    await settle();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', false);
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(2);
  });

  describe('route style while following roads', () => {
    const FULL = {
      surface: true,
      hilliness: true,
      avoidSteps: true,
      avoidBusyRoads: true,
    };

    it('is hidden unless following roads and the engine supports some', () => {
      mockCapabilities.mockReturnValue(caps(true));
      const utils = renderScreen();
      fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
      expect(utils.queryByText('Route style')).toBeNull();

      mockCapabilities.mockReturnValue(caps(true, FULL));
      const other = renderScreen();
      expect(other.queryByText('Route style')).toBeNull();
      fireEvent(
        other.getAllByLabelText('Follow roads')[0],
        'valueChange',
        true
      );
      expect(other.getByText('Route style')).toBeTruthy();
    });

    it('asks again with the chosen preferences', async () => {
      mockCapabilities.mockReturnValue(caps(true, FULL));
      mockGenerate.mockResolvedValue(snapped);
      const utils = renderScreen();
      fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
      tapMap(utils, 40);
      tapMap(utils, 40.004);
      await settle();
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate.mock.calls[0][0].style).toBeUndefined();

      fireEvent.press(utils.getByText('Trails'));
      await settle();
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate.mock.calls[1][0].style).toMatchObject({
        surface: 'trails',
      });
    });
  });
});
