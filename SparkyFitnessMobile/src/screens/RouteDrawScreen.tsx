import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import RouteElevationCard from '../components/exerciseStats/RouteElevationCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_ROUTE_STYLE,
  canAddFollowRoadsPoint,
  ROUTE_FOLLOW_ROADS_MAX_POINTS,
  countRouteTurns,
  hasRouteStyleControls,
  restrictRouteStyle,
  routeDistanceMeters,
  type RoutePoint,
  type RouteStyle,
} from '@workspace/shared';
import RouteStyleControls from '../components/RouteStyleControls';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useFollowRoadsRoute } from '../hooks/useFollowRoadsRoute';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import {
  saveDrawnRoute,
  useRouteGenerationCapabilities,
} from '../services/routeService';
import { routeGenerateErrorMessage } from '../utils/routeGenerateError';
import { formatRouteDistance } from '../utils/routeDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteDraw'>;

/** Shows most of a continent until the person's position is known. */
const FALLBACK_REGION = {
  latitude: 39.8,
  longitude: -98.6,
  latitudeDelta: 40,
  longitudeDelta: 40,
};
const MIN_ROUTE_METERS = 10;

/**
 * Draw a route by tapping the map: each tap adds a point and the points are
 * joined by straight lines, so tap often around bends. When the server has a
 * routing engine, "Follow roads" turns the taps into ordered waypoints and the
 * engine's line (with its turn cues) replaces the straight ones.
 */
const RouteDrawScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const lineColor = useCSSVariable('--color-accent-primary') as string;
  const mapRef = useRef<MapView>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [followRoads, setFollowRoads] = useState(false);
  const [style, setStyle] = useState<RouteStyle>(DEFAULT_ROUTE_STYLE);
  const { capabilities } = useRouteGenerationCapabilities();
  const available = capabilities.available;
  const snapping = available && followRoads;
  const followStyle = useMemo(
    () => restrictRouteStyle(style, capabilities.style),
    [style, capabilities.style]
  );
  const snap = useFollowRoadsRoute(snapping, points, followStyle);
  const snapped = snapping ? snap.preview : null;
  const atWaypointLimit = snapping && !canAddFollowRoadsPoint(points.length);

  const distance = snapped ? snapped.distanceM : routeDistanceMeters(points);
  // Following roads saves what the engine returned, so wait until it matches
  // the taps on screen.
  const canSave =
    points.length >= 2 &&
    distance >= MIN_ROUTE_METERS &&
    name.trim() !== '' &&
    (!snapping || (snapped !== null && snap.isCurrent));

  const centerOnPerson = () => {
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return;
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return;
      mapRef.current?.animateToRegion(
        {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        0
      );
    })().catch(() => undefined);
  };

  const save = () => {
    setSaving(true);
    void saveDrawnRoute(
      snapped
        ? { name: name.trim(), points: snapped.points, cues: snapped.cues }
        : { name: name.trim(), points }
    )
      .then((route) => navigation.replace('RouteDetail', { id: route.id }))
      .catch((error: unknown) => {
        addLog(`[Routes] Could not save a drawn route: ${error}`, 'WARNING');
        Toast.show({
          type: 'error',
          text1: t('routes.saveFailed', {
            defaultValue: 'Could not save the route',
          }),
        });
      })
      .finally(() => setSaving(false));
  };

  const header = useScreenHeader({
    title: t('screens.routeDraw', { defaultValue: 'Draw a route' }),
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      onPress: save,
      disabled: !canSave || saving,
      busy: saving,
    },
  });

  const coordinates = points.map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
  }));
  const lineCoordinates = (snapped?.points ?? points).map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
  }));

  return (
    <>
      {header}
      <View className="flex-1 bg-background">
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={FALLBACK_REGION}
          onMapReady={centerOnPerson}
          onPress={(event) => {
            if (atWaypointLimit) return;
            const { latitude, longitude } = event.nativeEvent.coordinate;
            setPoints((current) => [
              ...current,
              { lat: latitude, lon: longitude },
            ]);
          }}
          showsUserLocation
          toolbarEnabled={false}
        >
          {lineCoordinates.length > 1 ? (
            <Polyline
              coordinates={lineCoordinates}
              strokeColor={lineColor}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {coordinates.map((coordinate, index) => (
            <Marker
              key={index}
              coordinate={coordinate}
              pinColor={index === 0 ? 'green' : 'red'}
              opacity={
                index === 0 || index === coordinates.length - 1 ? 1 : 0.35
              }
            />
          ))}
        </MapView>
        <View
          className="absolute left-0 right-0 bottom-0 bg-surface px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {/* Only drawn when the points carry altitude; a tapped route has none. */}
          <RouteElevationCard points={points} unit={unit} className="mb-3" />
          <TextInput
            className="border-b border-border-subtle text-text-primary py-1"
            style={{ fontSize: 16 }}
            value={name}
            onChangeText={setName}
            maxLength={100}
            placeholder={t('routes.namePlaceholder', {
              defaultValue: 'Name this route',
            })}
            accessibilityLabel={t('routes.nameLabel', {
              defaultValue: 'Route name',
            })}
          />
          {available ? (
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-text-primary text-base">
                {t('routes.followRoads', { defaultValue: 'Follow roads' })}
              </Text>
              <Switch
                value={followRoads}
                onValueChange={setFollowRoads}
                accessibilityLabel={t('routes.followRoads', {
                  defaultValue: 'Follow roads',
                })}
              />
            </View>
          ) : null}
          {snapping && hasRouteStyleControls(capabilities.style) ? (
            <View className="mt-3">
              <RouteStyleControls
                value={style}
                onChange={setStyle}
                supported={capabilities.style}
                activity="run"
              />
            </View>
          ) : null}
          {snapping && snap.error ? (
            <View className="flex-row items-center justify-between mt-2">
              <Text className="text-text-secondary text-sm flex-1 mr-3">
                {routeGenerateErrorMessage(snap.error, t)}
              </Text>
              <Button variant="secondary" onPress={snap.retry}>
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </View>
          ) : null}
          {atWaypointLimit ? (
            <Text className="text-text-secondary text-sm mt-2">
              {t('routes.followRoadsLimit', {
                defaultValue:
                  'Following roads takes up to {{max}} points. Undo a point to add another.',
                max: ROUTE_FOLLOW_ROADS_MAX_POINTS,
              })}
            </Text>
          ) : null}
          <View className="flex-row items-center justify-between mt-3">
            <View className="flex-1 mr-3 flex-row items-center">
              <Text className="text-text-primary text-base font-semibold">
                {points.length < 2
                  ? t('routes.drawHint', {
                      defaultValue: 'Tap the map to add points',
                    })
                  : formatRouteDistance(distance, unit)}
                {snapped
                  ? ` · ${t('routes.turnCount', {
                      count: countRouteTurns(snapped.cues),
                      defaultValue: '{{count}} turns',
                      defaultValue_one: '{{count}} turn',
                      defaultValue_other: '{{count}} turns',
                    })}`
                  : ''}
              </Text>
              {snap.isLoading ? (
                <ActivityIndicator
                  className="ml-2"
                  accessibilityLabel={t('routes.findingRoute', {
                    defaultValue: 'Finding a route',
                  })}
                />
              ) : null}
            </View>
            <View className="flex-row gap-2">
              <Button
                variant="secondary"
                disabled={points.length === 0}
                onPress={() => setPoints((current) => current.slice(0, -1))}
              >
                {t('routes.undo', { defaultValue: 'Undo' })}
              </Button>
              <Button
                variant="secondary"
                disabled={points.length === 0}
                onPress={() => setPoints([])}
              >
                {t('routes.clear', { defaultValue: 'Clear' })}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default RouteDrawScreen;
