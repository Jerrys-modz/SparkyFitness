import React from 'react';
import { render } from '@testing-library/react-native';
import RouteTileMap from '../../src/components/exerciseStats/RouteTileMap';
import { ROUTE_STOPS_MAP_LIMIT } from '../../src/utils/routeStopsDisplay';

const points = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
  { lat: 40.02, lon: -74 },
];

describe('RouteTileMap stops', () => {
  it('draws no stop markers without stops', () => {
    const { queryAllByTestId, getAllByTestId } = render(
      <RouteTileMap points={points} accessibilityLabel="map" />
    );
    expect(
      queryAllByTestId('route-stop-marker', { hidden: true })
    ).toHaveLength(0);
    // The start dot and the finish ring.
    expect(getAllByTestId('map-marker', { hidden: true })).toHaveLength(2);
  });

  it('marks each stop where it is', () => {
    const { getAllByTestId } = render(
      <RouteTileMap
        points={points}
        accessibilityLabel="map"
        stops={[
          { kind: 'water', name: null, lat: 40.005, lon: -74.0005 },
          { kind: 'viewpoint', name: 'Ridge', lat: 40.015, lon: -74.0002 },
        ]}
      />
    );
    const markers = getAllByTestId('route-stop-marker', { hidden: true });
    expect(markers).toHaveLength(2);
    expect(markers[0].props.coordinate).toEqual({
      latitude: 40.005,
      longitude: -74.0005,
    });
  });

  it('puts a cap on how many markers it draws', () => {
    const stops = Array.from(
      { length: ROUTE_STOPS_MAP_LIMIT + 20 },
      (_, i) => ({
        kind: 'cafe' as const,
        name: null,
        lat: 40 + i * 0.0001,
        lon: -74,
      })
    );
    const { getAllByTestId } = render(
      <RouteTileMap points={points} accessibilityLabel="map" stops={stops} />
    );
    expect(getAllByTestId('route-stop-marker', { hidden: true })).toHaveLength(
      ROUTE_STOPS_MAP_LIMIT
    );
  });
});
