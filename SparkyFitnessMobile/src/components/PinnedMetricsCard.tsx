import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ACTIVITY_RING_LABELS } from '../constants/activityRings';
import type { ActivityRingKey } from '../constants/activityRings';
import type { HealthTrendKey } from '../constants/healthTrends';
import { useActivityRingLook } from '../hooks/useActivityRingLook';
import { formatLocalizedNumber } from '../localization/i18n';
import type { ActivityRingValue } from '../utils/activityRings';
import type { HealthTrendTileSummary } from '../utils/healthTrendTiles';
import type { ResolvedPinnedMetric } from '../utils/pinnedMetrics';
import HealthTrendTile from './HealthTrendTile';
import Icon from './Icon';
import ProgressRing from './ProgressRing';

const RING_SIZE = 40;
const RING_STROKE = 6;

type PinnedMetricsCardProps = {
  metrics: readonly ResolvedPinnedMetric[];
  ringValues: Record<ActivityRingKey, ActivityRingValue>;
  trendSummaries: Partial<Record<HealthTrendKey, HealthTrendTileSummary>>;
  /** The window each pinned trend covers, e.g. `7d`. */
  rangeFor: (key: HealthTrendKey) => string;
  weightUnit: string;
  waterUnit: string;
  onPressSettings?: () => void;
};

const RingTile: React.FC<{
  ringKey: ActivityRingKey;
  value: ActivityRingValue;
}> = ({ ringKey, value }) => {
  const { t } = useTranslation();
  const { colors, units, trackColor } = useActivityRingLook();
  const label = ACTIVITY_RING_LABELS[ringKey](t);
  const current = formatLocalizedNumber(Math.round(value.current));
  const goal = formatLocalizedNumber(Math.round(value.goal));
  const progress = value.goal > 0 ? value.current / value.goal : 0;
  return (
    <View
      testID={`pinned-ring-${ringKey}`}
      accessible
      accessibilityLabel={`${label}: ${current}${value.goal > 0 ? ` / ${goal}` : ''} ${units[ringKey]}`}
      className="w-[48%] bg-surface rounded-xl p-3 mb-2 shadow-sm flex-row items-center justify-between"
    >
      <View className="flex-1 mr-2">
        <Text className="text-text-muted text-xs" numberOfLines={1}>
          {label}
        </Text>
        <Text
          className="text-text-primary text-xl font-bold mt-1"
          numberOfLines={1}
        >
          {current}
        </Text>
        <Text className="text-text-muted text-xs" numberOfLines={1}>
          {value.goal > 0
            ? t('pinnedMetrics.ofGoal', {
                defaultValue: 'of {{goal}} {{unit}}',
                goal,
                unit: units[ringKey],
              })
            : units[ringKey]}
        </Text>
      </View>
      <ProgressRing
        progress={progress}
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
        color={colors[ringKey]}
        backgroundColor={trackColor}
      />
    </View>
  );
};

/**
 * Up to four metrics the user chose, as small tiles at the top of the Dashboard: an
 * activity ring against its goal, or a health trend's headline and sparkline.
 */
const PinnedMetricsCard: React.FC<PinnedMetricsCardProps> = ({
  metrics,
  ringValues,
  trendSummaries,
  rangeFor,
  weightUnit,
  waterUnit,
  onPressSettings,
}) => {
  const { t } = useTranslation();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  return (
    <View className="mb-1">
      <Pressable
        onPress={onPressSettings}
        disabled={!onPressSettings}
        accessibilityRole={onPressSettings ? 'button' : undefined}
        className="flex-row justify-between items-center mb-2"
      >
        <Text className="text-sm font-bold text-text-secondary">
          {t('dashboard.pinnedMetrics', { defaultValue: 'Pinned Metrics' })}
        </Text>
        {onPressSettings ? (
          <View className="flex-row items-center">
            <Text className="text-xs font-semibold text-accent-primary mr-1">
              {t('dashboard.pinnedMetricsSettings', {
                defaultValue: 'Settings',
              })}
            </Text>
            <Icon name="chevron-forward" size={14} color={accentColor} />
          </View>
        ) : null}
      </Pressable>
      {metrics.length === 0 ? (
        <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm">
          <Text className="text-text-muted text-sm text-center">
            {t('pinnedMetrics.empty', {
              defaultValue:
                'No metrics pinned. Choose some in Pinned Metrics settings.',
            })}
          </Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap justify-between">
          {metrics.map((metric) => {
            if (metric.kind === 'ring') {
              return (
                <RingTile
                  key={metric.pinned}
                  ringKey={metric.key}
                  value={ringValues[metric.key]}
                />
              );
            }
            const summary = trendSummaries[metric.key];
            if (!summary) return null;
            return (
              <HealthTrendTile
                key={metric.pinned}
                trendKey={metric.key}
                summary={summary}
                weightUnit={weightUnit}
                waterUnit={waterUnit}
                rangeLabel={rangeFor(metric.key)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export default PinnedMetricsCard;
