import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RoutePoint } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import type { DistanceUnit } from '../../utils/routeDisplay';
import { routeElevationProfile } from '../../utils/routeElevation';
import ElevationProfileChart from './ElevationProfileChart';

interface RouteElevationCardProps {
  points: readonly RoutePoint[];
  unit: DistanceUnit;
  /** Layout classes for the card; the default is a surface card below other content. */
  className?: string;
}

/**
 * The route's elevation profile. Renders nothing when the points carry no
 * altitude (a route drawn by hand has none), rather than drawing a flat line.
 */
const RouteElevationCard: React.FC<RouteElevationCardProps> = ({
  points,
  unit,
  className = 'bg-surface rounded-xl p-4 mt-4',
}) => {
  const { t } = useTranslation();
  const profile = useMemo(
    () => routeElevationProfile(points, unit),
    [points, unit]
  );
  if (!profile) return null;

  const miles = unit === 'miles';
  const heightUnit = miles ? 'ft' : 'm';
  const range = `${formatLocalizedNumber(Math.round(profile.minElevation))}–${formatLocalizedNumber(Math.round(profile.maxElevation))} ${heightUnit}`;

  return (
    <View className={className} testID="route-elevation">
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className="text-text-primary text-base font-bold">
          {t('routes.elevation.title', { defaultValue: 'Elevation' })}
        </Text>
        <Text className="text-text-secondary text-sm">{range}</Text>
      </View>
      <ElevationProfileChart data={profile.samples} />
      <Text className="text-text-muted text-xs text-center mt-1">
        {miles
          ? t('routes.elevation.milesAxis', {
              defaultValue: 'Miles from start, height in feet',
            })
          : t('routes.elevation.kilometersAxis', {
              defaultValue: 'Kilometers from start, height in meters',
            })}
      </Text>
    </View>
  );
};

export default RouteElevationCard;
