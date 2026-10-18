import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import HeatmapScreen from '../../src/screens/HeatmapScreen';
import { useHeatmap } from '../../src/services/heatmapService';
import { canShowRouteMap } from '../../src/utils/routeMapSupport';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/heatmapService', () => ({
  useHeatmap: jest.fn(),
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
});
