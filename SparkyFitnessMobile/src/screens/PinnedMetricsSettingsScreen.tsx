import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  ACTIVITY_RING_LABELS,
  STAND_HOURS_SUPPORTED,
} from '../constants/activityRings';
import { HEALTH_TREND_LABELS } from '../constants/healthTrends';
import {
  MAX_PINNED_METRICS,
  PINNED_METRIC_KEYS,
  type PinnedMetricKey,
} from '../constants/pinnedMetrics';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolvePinnedMetrics } from '../utils/pinnedMetrics';

type PinnedMetricsSettingsScreenProps =
  RootStackScreenProps<'PinnedMetricsSettings'>;

const PinnedMetricsSettingsScreen: React.FC<
  PinnedMetricsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const pinned = useAppPreferencesStore((s) => s.pinnedMetrics);
  const setPinned = useAppPreferencesStore((s) => s.setPinnedMetric);
  const pinnedKeys = resolvePinnedMetrics(pinned).map((m) => m.pinned);

  const header = useScreenHeader({
    title: t('screens.pinnedMetricsSettings', {
      defaultValue: 'Pinned Metrics',
    }),
    left: { kind: 'back' },
  });

  const labelFor = (key: PinnedMetricKey): string => {
    const [kind, name] = key.split(':');
    return kind === 'ring'
      ? ACTIVITY_RING_LABELS[name as keyof typeof ACTIVITY_RING_LABELS](t)
      : HEALTH_TREND_LABELS[name as keyof typeof HEALTH_TREND_LABELS](t);
  };

  const groups = [
    {
      title: t('pinnedMetrics.rings', { defaultValue: 'Rings' }),
      keys: PINNED_METRIC_KEYS.filter(
        (k) =>
          k.startsWith('ring:') && (k !== 'ring:stand' || STAND_HOURS_SUPPORTED)
      ),
    },
    {
      title: t('pinnedMetrics.trends', { defaultValue: 'Trends' }),
      keys: PINNED_METRIC_KEYS.filter((k) => k.startsWith('trend:')),
    },
  ];

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('pinnedMetrics.settingsDescription', {
            defaultValue:
              'Pick up to {{max}} metrics to keep at the top of your Dashboard. Rings show today against your goal; trends show the latest reading or average.',
            max: MAX_PINNED_METRICS,
          })}
        </Text>
        {groups.map((group) => (
          <View key={group.title} className="mb-2">
            <Text className="text-text-primary text-lg font-semibold mb-2">
              {group.title}
            </Text>
            <View className="flex-row flex-wrap">
              {group.keys.map((key) => {
                const isPinned = pinnedKeys.includes(key);
                const isFull =
                  !isPinned && pinnedKeys.length >= MAX_PINNED_METRICS;
                return (
                  <Pressable
                    key={key}
                    testID={`pinned-metric-toggle-${key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isPinned, disabled: isFull }}
                    disabled={isFull}
                    onPress={() => setPinned(key, !isPinned)}
                    className={`px-3 py-2 mr-2 mb-2 rounded-full border ${
                      isPinned
                        ? 'bg-accent-primary border-accent-primary'
                        : 'bg-raised border-border-subtle'
                    } ${isFull ? 'opacity-40' : ''}`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isPinned ? 'text-white' : 'text-text-primary'
                      }`}
                    >
                      {labelFor(key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default PinnedMetricsSettingsScreen;
