import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import HeatmapScreen from '../../src/screens/HeatmapScreen';
import {
  useHeatmap,
  useHeatmapTracks,
} from '../../src/services/heatmapService';
import { canShowRouteMap } from '../../src/utils/routeMapSupport';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/heatmapService', () => ({
  useHeatmap: jest.fn(),
  useHeatmapTracks: jest.fn(),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: jest.fn(() => true),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { timezone: 'UTC' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const props = {
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
  route: { key: 'Heatmap', name: 'Heatmap' },
} as unknown as RootStackScreenProps<'Heatmap'>;

const data = (overrides: Record<string, unknown> = {}) => ({
  cellM: 50,
  cells: [
    [40.0, -74.0, 1],
    [40.001, -74.0, 6],
    [40.002, -74.0, 12],
  ],
  maxCount: 12,
  activityCount: 14,
  truncated: false,
  bounds: { minLat: 40, maxLat: 40.01, minLon: -74.01, maxLon: -74 },
  firstDate: '2025-01-05',
  lastDate: '2026-10-12',
  ...overrides,
});
const answer = (value: unknown, state: Record<string, unknown> = {}) =>
  jest.mocked(useHeatmap).mockReturnValue({
    data: value,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
    ...state,
  } as never);

const tracksAnswer = (value: unknown, state: Record<string, unknown> = {}) =>
  jest.mocked(useHeatmapTracks).mockReturnValue({
    data: value,
    isFetching: false,
    isError: false,
    ...state,
  } as never);

const tracksData = (overrides: Record<string, unknown> = {}) => ({
  // Two activities on one street, one a little east.
  tracks: [
    [
      [
        [40.0, -74.0],
        [40.004, -74.0],
      ],
    ],
    [
      [
        [40.0, -74.0],
        [40.004, -74.0],
      ],
    ],
    [
      [
        [40.0, -74.001],
        [40.004, -74.001],
      ],
    ],
  ],
  pointCount: 6,
  truncated: false,
  toleranceM: 4,
  ...overrides,
});

const ZOOMED_IN = {
  latitude: 40.002,
  longitude: -74.0,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};
const ZOOMED_OUT = { ...ZOOMED_IN, latitudeDelta: 0.5, longitudeDelta: 0.5 };

const settle = (
  screen: ReturnType<typeof render>,
  region: typeof ZOOMED_IN
) => {
  const map = screen.getByTestId('map-view', { includeHiddenElements: true });
  act(() => map.props.onRegionChangeComplete(region));
};

const paramsOfCall = (call: number) =>
  jest.mocked(useHeatmap).mock.calls[call]?.[0] as Record<string, unknown>;
const lastBaseParams = () => {
  const calls = jest.mocked(useHeatmap).mock.calls;
  // Calls come in pairs per render: the overview, then the viewport query.
  for (let i = calls.length - 2; i >= 0; i -= 2) {
    const params = calls[i]?.[0] as Record<string, unknown>;
    if (!('view' in params) || params.view === undefined) return params;
  }
  return {};
};

describe('HeatmapScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(canShowRouteMap).mockReturnValue(true);
    tracksAnswer(undefined);
  });

  it('shows a spinner while it loads', () => {
    answer(undefined, { isLoading: true });
    const screen = render(<HeatmapScreen {...props} />);
    expect(screen.getByTestId('heatmap-loading')).toBeTruthy();
  });

  it('explains an empty map, and a failure with a retry', () => {
    answer(data({ cells: [], activityCount: 0, bounds: null }));
    expect(
      render(<HeatmapScreen {...props} />).getByTestId('heatmap-empty')
    ).toBeTruthy();
    const refetch = jest.fn();
    answer(undefined, { isError: true, refetch });
    const screen = render(<HeatmapScreen {...props} />);
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('draws a circle per cell, with a summary and a legend', () => {
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    expect(
      screen.getAllByTestId('map-circle', { includeHiddenElements: true })
    ).toHaveLength(3);
    expect(screen.getByTestId('heatmap-summary').props.children).toContain(
      '14 activities'
    );
    expect(screen.getByText('Less')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.queryByTestId('heatmap-truncated')).toBeNull();
  });

  it('says when only the busiest places are shown', () => {
    answer(data({ truncated: true }));
    expect(
      render(<HeatmapScreen {...props} />).getByTestId('heatmap-truncated')
    ).toBeTruthy();
  });

  it('tells how many times a tapped spot was used', () => {
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    const map = screen.getByTestId('map-view', { includeHiddenElements: true });
    act(() => {
      map.props.onPress({
        nativeEvent: { coordinate: { latitude: 40.0009, longitude: -74.0 } },
      });
    });
    expect(screen.getByText('Used 6 times')).toBeTruthy();
    act(() => {
      map.props.onPress({
        nativeEvent: { coordinate: { latitude: 41, longitude: -74.0 } },
      });
    });
    expect(screen.queryByTestId('heatmap-selected')).toBeNull();
  });

  it('says “time” for a single use', () => {
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    act(() => {
      screen
        .getByTestId('map-view', { includeHiddenElements: true })
        .props.onPress({
          nativeEvent: { coordinate: { latitude: 40.0, longitude: -74.0 } },
        });
    });
    expect(screen.getByText('Used 1 time')).toBeTruthy();
  });

  it('asks for all activities and all time first, then filters', () => {
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    expect(paramsOfCall(0)).toMatchObject({ maxCells: 900 });
    expect(paramsOfCall(0)).not.toHaveProperty('activities');
    expect(paramsOfCall(0)).not.toHaveProperty('from');

    fireEvent.press(screen.getByText('Ride'));
    expect(lastBaseParams()).toMatchObject({ activities: ['ride'] });
    fireEvent.press(screen.getByText('30 days'));
    expect(lastBaseParams()).toHaveProperty('from');
    expect(String(lastBaseParams().from)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.press(screen.getByText('All'));
    expect(lastBaseParams()).not.toHaveProperty('activities');
  });

  it('fetches the visible area once the map has settled, and not for a small pan', () => {
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    const map = () =>
      screen.getByTestId('map-view', { includeHiddenElements: true });
    const region = {
      latitude: 40.005,
      longitude: -74.005,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    act(() => map().props.onRegionChangeComplete(region));
    const calls = () =>
      jest.mocked(useHeatmap).mock.calls.map((c) => c[0] as { view?: unknown });
    const withView = calls().filter((c) => c.view !== undefined);
    expect(withView.length).toBeGreaterThan(0);
    const first = withView[withView.length - 1]?.view;
    act(() =>
      map().props.onRegionChangeComplete({ ...region, latitude: 40.0055 })
    );
    expect(calls().at(-1)?.view).toEqual(first);
    act(() =>
      map().props.onRegionChangeComplete({ ...region, latitude: 40.5 })
    );
    expect(calls().at(-1)?.view).not.toEqual(first);
  });

  it('falls back to a plain drawing where no map can be shown', () => {
    jest.mocked(canShowRouteMap).mockReturnValue(false);
    answer(data());
    const screen = render(<HeatmapScreen {...props} />);
    expect(screen.getByTestId('heatmap-plain')).toBeTruthy();
    expect(
      screen.queryByTestId('map-view', { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.queryByText(/Tap the map/)).toBeNull();
  });

  describe('line mode', () => {
    const polylines = (screen: ReturnType<typeof render>) =>
      screen.queryAllByTestId('map-polyline', { includeHiddenElements: true });
    const circles = (screen: ReturnType<typeof render>) =>
      screen.queryAllByTestId('map-circle', { includeHiddenElements: true });

    it('keeps the grid, and asks for no tracks, until the map is zoomed in', () => {
      answer(data());
      tracksAnswer(tracksData());
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_OUT);
      expect(polylines(screen)).toHaveLength(0);
      expect(circles(screen)).toHaveLength(3);
      const enabled = jest.mocked(useHeatmapTracks).mock.calls.at(-1)?.[1];
      expect(enabled).toBe(false);
    });

    it('draws thin round translucent lines and hides the grid when zoomed in', () => {
      answer(data());
      tracksAnswer(tracksData());
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      const lines = polylines(screen);
      expect(lines).toHaveLength(3);
      expect(lines[0]?.props.lineCap).toBe('round');
      expect(lines[0]?.props.strokeColor).toMatch(/^rgba\(.*, 0\.[23]\d*\)$/);
      expect(lines[0]?.props.strokeWidth).toBeLessThanOrEqual(4);
      expect(lines[0]?.props.coordinates[0]).toEqual({
        latitude: 40.0,
        longitude: -74.0,
      });
      expect(circles(screen)).toHaveLength(0);
      // The grid's legend gives way to a hint about the lines.
      expect(screen.queryByText('Less')).toBeNull();
      expect(screen.getByText(/brighter where they overlap/)).toBeTruthy();
    });

    it('asks for the tracks of the visible box with the same filters', () => {
      answer(data());
      tracksAnswer(undefined);
      const screen = render(<HeatmapScreen {...props} />);
      fireEvent.press(screen.getByText('Ride'));
      settle(screen, ZOOMED_IN);
      const [params, enabled] =
        jest.mocked(useHeatmapTracks).mock.calls.at(-1) ?? [];
      expect(enabled).toBe(true);
      expect(params).toMatchObject({
        activities: ['ride'],
        maxTracks: 300,
        maxPoints: 20000,
      });
      expect((params as { view: { minLat: number } }).view.minLat).toBeLessThan(
        40.002
      );
    });

    it('falls back to the grid when the tracks were cut short', () => {
      answer(data());
      tracksAnswer(tracksData({ truncated: true }));
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      expect(polylines(screen)).toHaveLength(0);
      expect(circles(screen)).toHaveLength(3);
    });

    it('falls back to the grid when the track request fails', () => {
      answer(data());
      tracksAnswer(undefined, { isError: true });
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      expect(polylines(screen)).toHaveLength(0);
      expect(circles(screen)).toHaveLength(3);
      expect(screen.getByText('Less')).toBeTruthy();
    });

    it('stays on the grid while the tracks are still loading', () => {
      answer(data());
      tracksAnswer(undefined, { isFetching: true });
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      expect(circles(screen)).toHaveLength(3);
    });

    it('counts the tracks passing under a tap', () => {
      answer(data());
      tracksAnswer(tracksData());
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      const press = (latitude: number, longitude: number) =>
        act(() => {
          screen
            .getByTestId('map-view', { includeHiddenElements: true })
            .props.onPress({
              nativeEvent: { coordinate: { latitude, longitude } },
            });
        });
      press(40.002, -74.0);
      expect(screen.getByText('Used 2 times')).toBeTruthy();
      press(40.002, -74.001);
      expect(screen.getByText('Used 1 time')).toBeTruthy();
      // The tap is marked by a circle the size of the reach.
      expect(circles(screen)).toHaveLength(1);
      // Away from every line: nothing is selected.
      press(40.002, -74.01);
      expect(screen.queryByTestId('heatmap-selected')).toBeNull();
    });

    it('drops a selection made in one mode when the other takes over', () => {
      answer(data());
      tracksAnswer(tracksData());
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      act(() => {
        screen
          .getByTestId('map-view', { includeHiddenElements: true })
          .props.onPress({
            nativeEvent: { coordinate: { latitude: 40.002, longitude: -74.0 } },
          });
      });
      expect(screen.getByTestId('heatmap-selected')).toBeTruthy();
      settle(screen, ZOOMED_OUT);
      expect(screen.queryByTestId('heatmap-selected')).toBeNull();
    });

    it('counts grid cells as before when line mode is not on', () => {
      answer(data());
      tracksAnswer(tracksData({ truncated: true }));
      const screen = render(<HeatmapScreen {...props} />);
      settle(screen, ZOOMED_IN);
      act(() => {
        screen
          .getByTestId('map-view', { includeHiddenElements: true })
          .props.onPress({
            nativeEvent: {
              coordinate: { latitude: 40.0009, longitude: -74.0 },
            },
          });
      });
      expect(screen.getByText('Used 6 times')).toBeTruthy();
    });
  });
});
