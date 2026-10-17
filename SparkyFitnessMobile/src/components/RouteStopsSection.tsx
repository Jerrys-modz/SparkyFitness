import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ROUTE_STOP_KINDS,
  countRouteStops,
  type RouteStopKind,
  type RouteStopsResponse,
} from '@workspace/shared';
import { formatRouteDistance, type DistanceUnit } from '../utils/routeDisplay';
import {
  ROUTE_STOPS_LIST_LIMIT,
  ROUTE_STOP_COLORS,
} from '../utils/routeStopsDisplay';

interface RouteStopsSectionProps {
  /** Null while there is no answer yet. */
  stops: RouteStopsResponse | null;
  isLoading: boolean;
  unit: DistanceUnit;
}

/** "Stops along the way": counts by kind, then each stop in route order. */
const RouteStopsSection: React.FC<RouteStopsSectionProps> = ({
  stops,
  isLoading,
  unit,
}) => {
  const { t } = useTranslation();
  const kindName = (kind: RouteStopKind, count: number): string =>
    ({
      water: t('routes.stops.water', {
        count,
        defaultValue: '{{count}} water',
        defaultValue_one: '{{count}} water',
        defaultValue_other: '{{count}} water',
      }),
      toilets: t('routes.stops.toilets', {
        count,
        defaultValue: '{{count}} toilets',
        defaultValue_one: '{{count}} toilet',
        defaultValue_other: '{{count}} toilets',
      }),
      cafe: t('routes.stops.cafe', {
        count,
        defaultValue: '{{count}} cafes',
        defaultValue_one: '{{count}} cafe',
        defaultValue_other: '{{count}} cafes',
      }),
      viewpoint: t('routes.stops.viewpoint', {
        count,
        defaultValue: '{{count}} viewpoints',
        defaultValue_one: '{{count}} viewpoint',
        defaultValue_other: '{{count}} viewpoints',
      }),
    })[kind];
  const kindLabel: Record<RouteStopKind, string> = {
    water: t('routes.stops.kindWater', { defaultValue: 'Drinking water' }),
    toilets: t('routes.stops.kindToilets', { defaultValue: 'Toilets' }),
    cafe: t('routes.stops.kindCafe', { defaultValue: 'Cafe' }),
    viewpoint: t('routes.stops.kindViewpoint', { defaultValue: 'Viewpoint' }),
  };

  let body: React.ReactNode;
  if (isLoading) {
    body = <ActivityIndicator />;
  } else if (!stops || stops.status === 'no_data') {
    body = (
      <Text className="text-text-secondary text-sm">
        {t('routes.stops.noData', {
          defaultValue: 'Stop information is not available right now.',
        })}
      </Text>
    );
  } else if (stops.stops.length === 0) {
    body = (
      <Text className="text-text-secondary text-sm">
        {t('routes.stops.none', {
          defaultValue: 'No stops found near this route.',
        })}
      </Text>
    );
  } else {
    const counts = countRouteStops(stops.stops);
    const listed = stops.stops.slice(0, ROUTE_STOPS_LIST_LIMIT);
    const hidden = stops.stops.length - listed.length;
    body = (
      <>
        <Text
          className="text-text-secondary text-sm"
          testID="route-stops-counts"
        >
          {ROUTE_STOP_KINDS.filter((kind) => counts[kind] > 0)
            .map((kind) => kindName(kind, counts[kind]))
            .join(' · ')}
          {stops.truncated
            ? ` · ${t('routes.stops.truncated', { defaultValue: 'and more' })}`
            : ''}
        </Text>
        <View className="mt-2">
          {listed.map((stop, index) => (
            <View
              key={`${stop.kind}-${index}`}
              className="flex-row items-center py-1.5"
              testID="route-stop-row"
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: ROUTE_STOP_COLORS[stop.kind],
                }}
              />
              <Text
                className="text-text-primary text-sm flex-1 ml-3"
                numberOfLines={1}
              >
                {stop.name ?? kindLabel[stop.kind]}
                {stop.name ? ` · ${kindLabel[stop.kind]}` : ''}
              </Text>
              <Text className="text-text-secondary text-sm ml-3">
                {formatRouteDistance(stop.distanceFromStartM, unit)}
              </Text>
            </View>
          ))}
          {hidden > 0 ? (
            <Text className="text-text-secondary text-xs mt-1">
              {t('routes.stops.more', {
                count: hidden,
                defaultValue: '{{count}} more not shown',
                defaultValue_one: '{{count}} more not shown',
                defaultValue_other: '{{count}} more not shown',
              })}
            </Text>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID="route-stops">
      <Text className="text-text-primary text-base font-semibold mb-2">
        {t('routes.stops.title', { defaultValue: 'Stops along the way' })}
      </Text>
      {body}
      <Text className="text-text-secondary text-xs mt-2">
        {t('routes.stops.attribution', {
          defaultValue: 'Map data from OpenStreetMap contributors.',
        })}
      </Text>
    </View>
  );
};

export default RouteStopsSection;
