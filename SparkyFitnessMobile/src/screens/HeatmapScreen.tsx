import React, { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import MapView, { Circle, type MapPressEvent } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import {
  heatIntensityClass,
  isValidTimeZone,
  todayInZone,
  type HeatCell,
} from '@workspace/shared';
import HeatmapPlain from '../components/segments/HeatmapPlain';
import SegmentedControl from '../components/SegmentedControl';
import Button from '../components/ui/Button';
import { DARK_MAP_STYLE } from '../components/exerciseStats/darkMapStyle';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useHeatmap } from '../services/heatmapService';
import { formatDayLabel } from '../utils/dayLabel';
import {
  cellAtTap,
  HEATMAP_ACTIVITIES,
  HEATMAP_CLASSES,
  HEATMAP_COLORS,
  HEATMAP_MAX_CELLS,
  HEATMAP_PERIODS,
  heatCellRadiusM,
  heatmapPeriodFrom,
  regionForCells,
  viewFromRegion,
  viewInside,
  type HeatmapActivity,
  type HeatmapPeriod,
  type MapRegionLike,
} from '../utils/heatmapDisplay';
import { canShowRouteMap } from '../utils/routeMapSupport';
import type { RootStackScreenProps } from '../types/navigation';
import type { HeatmapParams } from '../services/api/heatmapApi';

type Props = RootStackScreenProps<'Heatmap'>;

/**
 * Everywhere the person has run, walked, ridden or hiked, drawn over a map:
 * brighter where they have been more often. Filter by activity and period;
 * tap the map to see how many times a spot was used. Personal only: it is
 * built from their own tracks, by the server, and never shared.
 */
const HeatmapScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const { preferences } = usePreferences();
  const timezone =
    preferences?.timezone && isValidTimeZone(preferences.timezone)
      ? preferences.timezone
      : 'UTC';

  const [activity, setActivity] = useState<HeatmapActivity>('all');
  const [period, setPeriod] = useState<HeatmapPeriod>('all');
  const [region, setRegion] = useState<MapRegionLike | null>(null);
  const [view, setView] = useState<HeatmapParams['view']>();
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const mapRef = useRef<MapView>(null);

  const header = useScreenHeader({
    title: t('screens.heatmap', { defaultValue: 'Heatmap' }),
    left: { kind: 'back' },
  });

  const base: HeatmapParams = useMemo(
    () => ({
      ...(activity !== 'all' ? { activities: [activity] } : {}),
      ...(heatmapPeriodFrom(period, todayInZone(timezone))
        ? { from: heatmapPeriodFrom(period, todayInZone(timezone)) }
        : {}),
      maxCells: HEATMAP_MAX_CELLS,
    }),
    [activity, period, timezone]
  );
  const overview = useHeatmap(base);
  const detail = useHeatmap({ ...base, view }, view !== undefined);
  const data =
    view !== undefined ? (detail.data ?? overview.data) : overview.data;
  const mapAvailable = canShowRouteMap();

  // Frame where the heat is, once per filter (not on every pan or refetch).
  const initialRegion = useMemo(
    () => (overview.data ? regionForCells(overview.data.cells) : null),
    [overview.data]
  );

  const onRegionChangeComplete = (next: MapRegionLike) => {
    setRegion(next);
    if (!viewInside(next, view)) setView(viewFromRegion(next));
  };

  const onMapPress = (event: MapPressEvent) => {
    if (!data) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const cells: HeatCell[] = data.cells.map(([lat, lon, count]) => ({
      lat,
      lon,
      count,
    }));
    setSelected(cellAtTap(cells, data.cellM, latitude, longitude));
  };

  const activityLabels: Record<HeatmapActivity, string> = {
    all: t('heatmap.activity.all', { defaultValue: 'All' }),
    run: t('recordActivity.activity.run', { defaultValue: 'Run' }),
    walk: t('recordActivity.activity.walk', { defaultValue: 'Walk' }),
    ride: t('recordActivity.activity.ride', { defaultValue: 'Ride' }),
    hike: t('routes.activity.hike', { defaultValue: 'Hike' }),
  };
  const periodLabels: Record<HeatmapPeriod, string> = {
    '30d': t('heatmap.period.30d', { defaultValue: '30 days' }),
    '90d': t('heatmap.period.90d', { defaultValue: '90 days' }),
    '1y': t('heatmap.period.1y', { defaultValue: 'Year' }),
    all: t('heatmap.period.all', { defaultValue: 'All time' }),
  };

  const changeFilter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setSelected(null);
      setView(undefined);
      set(value);
    };

  const empty = !!data && data.activityCount === 0;

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        scrollEnabled={!mapAvailable}
      >
        <View className="gap-2 mb-3">
          <SegmentedControl
            segments={HEATMAP_ACTIVITIES.map((key) => ({
              key,
              label: activityLabels[key],
            }))}
            activeKey={activity}
            onSelect={changeFilter(setActivity)}
          />
          <SegmentedControl
            segments={HEATMAP_PERIODS.map((key) => ({
              key,
              label: periodLabels[key],
            }))}
            activeKey={period}
            onSelect={changeFilter(setPeriod)}
          />
        </View>

        {overview.isLoading ? (
          <ActivityIndicator testID="heatmap-loading" />
        ) : overview.isError && !data ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('heatmap.loadFailed', {
                defaultValue: 'Could not load your heatmap.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void overview.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : empty || !data ? (
          <Text
            className="text-text-secondary text-base text-center py-8"
            testID="heatmap-empty"
          >
            {t('heatmap.empty', {
              defaultValue:
                'Nothing to show for this filter yet. Runs, walks and rides with a recorded GPS track appear here.',
            })}
          </Text>
        ) : (
          <>
            {mapAvailable ? (
              <View
                className="rounded-lg overflow-hidden"
                style={{ height: 420 }}
                testID="heatmap-map"
              >
                <MapView
                  key={`${activity}:${period}`}
                  ref={mapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialRegion ?? undefined}
                  onRegionChangeComplete={onRegionChangeComplete}
                  onPress={onMapPress}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  userInterfaceStyle={isDark ? 'dark' : 'light'}
                  customMapStyle={isDark ? DARK_MAP_STYLE : []}
                >
                  {data.cells.map(([lat, lon, count]) => (
                    <Circle
                      key={`${lat}:${lon}`}
                      center={{ latitude: lat, longitude: lon }}
                      radius={heatCellRadiusM(data.cellM)}
                      fillColor={
                        HEATMAP_COLORS[
                          heatIntensityClass(
                            count,
                            data.maxCount,
                            HEATMAP_CLASSES
                          )
                        ]
                      }
                      strokeColor="rgba(0,0,0,0)"
                      strokeWidth={0}
                    />
                  ))}
                  {selected ? (
                    <Circle
                      center={{
                        latitude: selected.lat,
                        longitude: selected.lon,
                      }}
                      radius={heatCellRadiusM(data.cellM) * 1.1}
                      strokeColor="#ffffff"
                      strokeWidth={2}
                      fillColor="rgba(255,255,255,0.15)"
                    />
                  ) : null}
                </MapView>
              </View>
            ) : (
              <HeatmapPlain
                data={data}
                accessibilityLabel={t('heatmap.mapA11y', {
                  defaultValue:
                    'Heatmap of where you have been, brighter where you went more often',
                })}
              />
            )}

            {selected ? (
              <View
                className="bg-surface rounded-xl p-3 mt-3"
                testID="heatmap-selected"
              >
                <Text className="text-text-primary text-base font-semibold">
                  {t('heatmap.used', {
                    count: selected.count,
                    defaultValue: 'Used {{count}} times',
                    defaultValue_one: 'Used {{count}} time',
                    defaultValue_other: 'Used {{count}} times',
                  })}
                </Text>
                {data.cellM > 100 ? (
                  <Text className="text-text-secondary text-xs mt-0.5">
                    {t('heatmap.usedApprox', {
                      distance: Math.round(data.cellM),
                      defaultValue:
                        'The busiest road in a {{distance}} m square. Zoom in for a single road.',
                    })}
                  </Text>
                ) : null}
              </View>
            ) : mapAvailable ? (
              <Text className="text-text-muted text-xs text-center mt-2">
                {t('heatmap.tapHint', {
                  defaultValue: 'Tap the map to see how often a road was used.',
                })}
              </Text>
            ) : null}

            <View className="flex-row items-center justify-center gap-2 mt-3">
              <Text className="text-text-secondary text-xs">
                {t('heatmap.fewer', { defaultValue: 'Less' })}
              </Text>
              {HEATMAP_COLORS.map((color) => (
                <View
                  key={color}
                  style={{
                    width: 16,
                    height: 10,
                    borderRadius: 3,
                    backgroundColor: color,
                  }}
                />
              ))}
              <Text className="text-text-secondary text-xs">
                {t('heatmap.more', { defaultValue: 'More' })}
              </Text>
            </View>

            <Text
              className="text-text-secondary text-sm text-center mt-3"
              testID="heatmap-summary"
            >
              {[
                t('heatmap.activities', {
                  count: data.activityCount,
                  defaultValue: '{{count}} activities',
                  defaultValue_one: '{{count}} activity',
                  defaultValue_other: '{{count}} activities',
                }),
                data.firstDate && data.lastDate
                  ? `${formatDayLabel(data.firstDate)} – ${formatDayLabel(data.lastDate)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {data.truncated ? (
              <Text
                className="text-text-muted text-xs text-center mt-1"
                testID="heatmap-truncated"
              >
                {t('heatmap.truncated', {
                  defaultValue:
                    'Showing the busiest places. Zoom in or choose a shorter period to see more.',
                })}
              </Text>
            ) : null}
            {region && detail.isFetching ? (
              <ActivityIndicator className="mt-2" testID="heatmap-updating" />
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
};

export default HeatmapScreen;
