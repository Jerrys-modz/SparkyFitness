import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useCSSVariable, useUniwind } from 'uniwind';
import type { GpsTrackPoint, RouteStop } from '@workspace/shared';
import { routeRegion, usableRoutePoints } from '../../utils/cardioSession';
import {
  ROUTE_STOPS_MAP_LIMIT,
  ROUTE_STOP_COLORS,
} from '../../utils/routeStopsDisplay';
import { DARK_MAP_STYLE } from './darkMapStyle';

const HEIGHT = 220;
const MARKER_CENTER = { x: 0.5, y: 0.5 };

interface RouteTileMapProps {
  points: readonly Pick<GpsTrackPoint, 'lat' | 'lon'>[];
  accessibilityLabel: string;
  /** Stops to mark along the route, as small coloured dots. */
  stops?: readonly Pick<RouteStop, 'kind' | 'name' | 'lat' | 'lon'>[];
}

/**
 * The GPS track over a real map: Apple Maps on iOS, Google Maps on Android.
 * Same start dot and finish ring as the plain line.
 *
 * The map is a still picture of the route: panning and zooming are off so it
 * never takes the screen's scroll, and on Android it renders in lite mode (a
 * static image, cheaper inside a scroll view). It never sets `googleMapId`;
 * a map ID moves every load onto the billed Dynamic Maps SKU, and plain Maps
 * SDK loads are free.
 */
const RouteTileMap: React.FC<RouteTileMapProps> = ({
  points,
  accessibilityLabel,
  stops,
}) => {
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const [routeColor, startColor, finishColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-heart-rate',
  ]) as [string, string, string];

  const coordinates = useMemo(
    () =>
      usableRoutePoints(points).map((p) => ({
        latitude: p.lat,
        longitude: p.lon,
      })),
    [points]
  );
  const region = useMemo(() => routeRegion(points), [points]);
  const start = coordinates[0];
  const finish = coordinates[coordinates.length - 1];
  if (!region || !start || !finish) return null;

  return (
    <View
      className="rounded-lg overflow-hidden"
      style={{ height: HEIGHT }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="route-tile-map"
    >
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        liteMode
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Polyline
          coordinates={coordinates}
          strokeColor={routeColor}
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
        {(stops ?? []).slice(0, ROUTE_STOPS_MAP_LIMIT).map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            anchor={MARKER_CENTER}
            tracksViewChanges={false}
            testID="route-stop-marker"
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: '#ffffff',
                backgroundColor: ROUTE_STOP_COLORS[stop.kind],
              }}
            />
          </Marker>
        ))}
        {/* The finish is a ring so a loop that ends where it began still
            shows the start dot inside it. */}
        <Marker coordinate={finish} anchor={MARKER_CENTER}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 3,
              borderColor: finishColor,
            }}
          />
        </Marker>
        <Marker coordinate={start} anchor={MARKER_CENTER}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: startColor,
            }}
          />
        </Marker>
      </MapView>
    </View>
  );
};

export default RouteTileMap;
