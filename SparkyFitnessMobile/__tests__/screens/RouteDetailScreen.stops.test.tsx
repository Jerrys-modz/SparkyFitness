import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RouteDetailScreen from '../../src/screens/RouteDetailScreen';
import { useRoute, useRouteStops } from '../../src/services/routeService';

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/services/segmentService', () => ({
  useSegments: jest.fn(() => ({ segments: [] })),
}));
jest.mock('../../src/services/routeService', () => ({
  removeRoute: jest.fn(),
  renameRoute: jest.fn(),
  shareRouteGpx: jest.fn(),
  useRoute: jest.fn(),
  useRouteRuns: jest.fn(() => ({ runs: [] })),
  useRouteStops: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockRoute = useRoute as jest.Mock;
const mockStops = useRouteStops as jest.Mock;

const saved = {
  id: 'route-1',
  name: 'Park loop',
  activity: 'run',
  source: 'drawn',
  distanceM: 2200,
  elevationGainM: null,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
    { lat: 40.02, lon: -74 },
  ],
  cues: [],
};

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <RouteDetailScreen
        navigation={{ goBack: jest.fn() } as never}
        route={
          { key: 'k', name: 'RouteDetail', params: { id: 'route-1' } } as never
        }
      />
    </SafeAreaProvider>
  );
}

describe('RouteDetailScreen stops', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoute.mockReturnValue({
      route: saved,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('hides the section when the server has no stops lookup', () => {
    mockStops.mockReturnValue({
      stops: null,
      isLoading: false,
      available: false,
    });
    const { queryByTestId, queryByText } = renderScreen();
    expect(queryByTestId('route-stops')).toBeNull();
    expect(queryByText('Stops along the way')).toBeNull();
  });

  it('lists the stops and marks them on the map', () => {
    mockStops.mockReturnValue({
      available: true,
      isLoading: false,
      stops: {
        status: 'ok',
        truncated: false,
        stops: [
          {
            kind: 'water',
            name: null,
            lat: 40.005,
            lon: -74.0005,
            distanceFromStartM: 560,
            offRouteM: 40,
          },
          {
            kind: 'cafe',
            name: 'Corner Cafe',
            lat: 40.015,
            lon: -74.0002,
            distanceFromStartM: 1700,
            offRouteM: 20,
          },
        ],
      },
    });
    const { getByText, getAllByTestId } = renderScreen();
    expect(getByText('Stops along the way')).toBeTruthy();
    expect(getByText('1 water · 1 cafe')).toBeTruthy();
    expect(getByText('Corner Cafe · Cafe')).toBeTruthy();
    expect(getAllByTestId('route-stop-row')).toHaveLength(2);
    expect(getAllByTestId('route-stop-marker', { hidden: true })).toHaveLength(
      2
    );
  });

  it('shows the route and a calm notice when the lookup has no data', () => {
    mockStops.mockReturnValue({
      available: true,
      isLoading: false,
      stops: { status: 'no_data', stops: [], truncated: false },
    });
    const { getByText, queryAllByTestId, getByTestId } = renderScreen();
    expect(
      getByText('Stop information is not available right now.')
    ).toBeTruthy();
    expect(
      queryAllByTestId('route-stop-marker', { hidden: true })
    ).toHaveLength(0);
    expect(getByTestId('route-tile-map')).toBeTruthy();
    expect(getByText('Park loop')).toBeTruthy();
  });

  it('keeps the rest of the screen working while stops load', () => {
    mockStops.mockReturnValue({
      available: true,
      isLoading: true,
      stops: null,
    });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Rename'));
    expect(getByText('Save')).toBeTruthy();
  });
});
