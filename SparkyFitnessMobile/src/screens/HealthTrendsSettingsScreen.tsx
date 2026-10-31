import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import {
  HEALTH_TREND_LABELS,
  MAX_HEALTH_TREND_TILES,
} from '../constants/healthTrends';
import SegmentedControl from '../components/SegmentedControl';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveHealthTrendOrder } from '../utils/healthTrendPreferences';

type HealthTrendsSettingsScreenProps =
  RootStackScreenProps<'HealthTrendsSettings'>;

const HealthTrendsSettingsScreen: React.FC<
  HealthTrendsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const healthTrendOrder = useAppPreferencesStore((s) => s.healthTrendOrder);
  const hiddenHealthTrends = useAppPreferencesStore(
    (s) => s.hiddenHealthTrends
  );
  const setHealthTrendOrder = useAppPreferencesStore(
    (s) => s.setHealthTrendOrder
  );
  const setHealthTrendHidden = useAppPreferencesStore(
    (s) => s.setHealthTrendHidden
  );

  const layout = useAppPreferencesStore((s) => s.healthTrendsLayout);
  const setLayout = useAppPreferencesStore((s) => s.setHealthTrendsLayout);
  const tileKeys = useAppPreferencesStore((s) => s.healthTrendTiles);
  const setTile = useAppPreferencesStore((s) => s.setHealthTrendTile);

  const items = useMemo(
    () =>
      resolveHealthTrendOrder(healthTrendOrder).map((key) => ({
        key,
        label: HEALTH_TREND_LABELS[key](t),
      })),
    [healthTrendOrder, t]
  );

  const header = useScreenHeader({
    title: t('screens.healthTrendsSettings', { defaultValue: 'Health Trends' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('healthTrendsSettings.description', {
            defaultValue:
              'Drag a graph by its handle to reorder it. Toggle off to hide it from your Dashboard.',
          })}
        </Text>

        <Text className="text-text-primary text-lg font-semibold mb-2">
          {t('healthTrendsSettings.layout', { defaultValue: 'Layout' })}
        </Text>
        <SegmentedControl
          segments={[
            {
              key: 'pager',
              label: t('healthTrendsSettings.layoutPager', {
                defaultValue: 'Swipe',
              }),
            },
            {
              key: 'tiles',
              label: t('healthTrendsSettings.layoutTiles', {
                defaultValue: 'Tiles',
              }),
            },
          ]}
          activeKey={layout}
          onSelect={setLayout}
        />

        {layout === 'tiles' && (
          <View className="mt-4">
            <Text className="text-text-secondary text-sm mb-2">
              {t('healthTrendsSettings.tilesDescription', {
                defaultValue: 'Choose up to {{max}} graphs to show as tiles.',
                max: MAX_HEALTH_TREND_TILES,
              })}
            </Text>
            <View className="flex-row flex-wrap">
              {items.map(({ key, label }) => {
                const isTile = tileKeys.includes(key);
                const isFull =
                  !isTile && tileKeys.length >= MAX_HEALTH_TREND_TILES;
                return (
                  <Pressable
                    key={key}
                    testID={`health-trend-tile-toggle-${key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isTile, disabled: isFull }}
                    disabled={isFull}
                    onPress={() => setTile(key, !isTile)}
                    className={`px-3 py-2 mr-2 mb-2 rounded-full border ${
                      isTile
                        ? 'bg-accent-primary border-accent-primary'
                        : 'bg-raised border-border-subtle'
                    } ${isFull ? 'opacity-40' : ''}`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isTile ? 'text-white' : 'text-text-primary'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Text className="text-text-primary text-lg font-semibold mt-4 mb-2">
          {t('healthTrendsSettings.graphs', { defaultValue: 'Graphs' })}
        </Text>
        <ReorderSwitchList
          items={items}
          testIDPrefix="health-trend"
          isEnabled={(key) => !hiddenHealthTrends.includes(key)}
          onToggle={(key, enabled) => setHealthTrendHidden(key, !enabled)}
          onReorder={setHealthTrendOrder}
          reorderA11yLabel={(name) =>
            t('healthTrendsSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('healthTrendsSettings.reorderHint', {
            defaultValue: 'Reorder this graph in your Dashboard health trends',
          })}
        />
      </ScrollView>
    </View>
  );
};

export default HealthTrendsSettingsScreen;
