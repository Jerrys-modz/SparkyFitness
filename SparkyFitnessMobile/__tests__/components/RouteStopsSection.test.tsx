import React from 'react';
import { render } from '@testing-library/react-native';
import type { RouteStop, RouteStopsResponse } from '@workspace/shared';
import RouteStopsSection from '../../src/components/RouteStopsSection';
import { ROUTE_STOPS_LIST_LIMIT } from '../../src/utils/routeStopsDisplay';

const stop = (overrides: Partial<RouteStop> = {}): RouteStop => ({
  kind: 'cafe',
  name: null,
  lat: 40,
  lon: -74,
  distanceFromStartM: 1500,
  offRouteM: 20,
  ...overrides,
});

const ok = (stops: RouteStop[], truncated = false): RouteStopsResponse => ({
  status: 'ok',
  stops,
  truncated,
});

describe('RouteStopsSection', () => {
  it('shows counts by kind and each stop with its distance from the start', () => {
    const { getByTestId, getAllByTestId, getByText } = render(
      <RouteStopsSection
        unit="km"
        isLoading={false}
        stops={ok([
          stop({ kind: 'water', distanceFromStartM: 800 }),
          stop({ kind: 'cafe', name: 'Corner Cafe', distanceFromStartM: 1500 }),
          stop({ kind: 'cafe', distanceFromStartM: 2200 }),
          stop({ kind: 'viewpoint', distanceFromStartM: 3000 }),
        ])}
      />
    );
    expect(getByText('Stops along the way')).toBeTruthy();
    expect(getByTestId('route-stops-counts').props.children.join('')).toBe(
      '1 water · 2 cafes · 1 viewpoint'
    );
    expect(getAllByTestId('route-stop-row')).toHaveLength(4);
    expect(getByText('Corner Cafe · Cafe')).toBeTruthy();
    expect(getByText('Drinking water')).toBeTruthy();
    expect(getByText('0.80 km')).toBeTruthy();
    expect(getByText('1.50 km')).toBeTruthy();
  });

  it('formats distances in miles for those who use them', () => {
    const { getByText } = render(
      <RouteStopsSection
        unit="miles"
        isLoading={false}
        stops={ok([stop({ distanceFromStartM: 1609 })])}
      />
    );
    expect(getByText('1.00 mi')).toBeTruthy();
  });

  it('lists a limited number but counts them all', () => {
    const many = Array.from({ length: ROUTE_STOPS_LIST_LIMIT + 5 }, (_, i) =>
      stop({ distanceFromStartM: i * 10 })
    );
    const { getAllByTestId, getByText, getByTestId } = render(
      <RouteStopsSection unit="km" isLoading={false} stops={ok(many, true)} />
    );
    expect(getAllByTestId('route-stop-row')).toHaveLength(
      ROUTE_STOPS_LIST_LIMIT
    );
    expect(getByText('5 more not shown')).toBeTruthy();
    expect(getByTestId('route-stops-counts').props.children.join('')).toContain(
      '30 cafes'
    );
    expect(getByTestId('route-stops-counts').props.children.join('')).toContain(
      'and more'
    );
  });

  it('says so when nothing is near the route', () => {
    const { getByText } = render(
      <RouteStopsSection unit="km" isLoading={false} stops={ok([])} />
    );
    expect(getByText('No stops found near this route.')).toBeTruthy();
  });

  it.each([
    [
      'the server has no data',
      { status: 'no_data' as const, stops: [], truncated: false },
    ],
    ['there is no answer', null],
  ])('degrades quietly when %s', (_name, stops) => {
    const { getByText, queryAllByTestId } = render(
      <RouteStopsSection unit="km" isLoading={false} stops={stops} />
    );
    expect(
      getByText('Stop information is not available right now.')
    ).toBeTruthy();
    expect(queryAllByTestId('route-stop-row')).toHaveLength(0);
  });

  it('shows a spinner while loading', () => {
    const { queryByText, UNSAFE_getByType } = render(
      <RouteStopsSection unit="km" isLoading stops={null} />
    );
    expect(queryByText(/not available/)).toBeNull();
    expect(
      UNSAFE_getByType(require('react-native').ActivityIndicator)
    ).toBeTruthy();
  });

  it('credits OpenStreetMap', () => {
    const { getByText } = render(
      <RouteStopsSection unit="km" isLoading={false} stops={ok([stop()])} />
    );
    expect(getByText(/OpenStreetMap contributors/)).toBeTruthy();
  });
});
