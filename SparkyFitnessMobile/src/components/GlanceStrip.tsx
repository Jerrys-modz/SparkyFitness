import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ACTIVITY_RING_LABELS } from '../constants/activityRings';
import type { ActivityRingKey } from '../constants/activityRings';
import type { HealthTrendKey } from '../constants/healthTrends';
import { HEALTH_TREND_LABELS } from '../constants/healthTrends';
import {
  GOAL_METRIC_LABELS,
  type GoalMetricKey,
} from '../constants/pinnedMetrics';
import { useActivityRingLook } from '../hooks/useActivityRingLook';
import { useGoalMetricLook } from '../hooks/useGoalMetricLook';
import { formatLocalizedNumber } from '../localization/i18n';
import type { ActivityRingValue } from '../utils/activityRings';
import type { HealthTrendTileSummary } from '../utils/healthTrendTiles';
import type { ResolvedPinnedMetric } from '../utils/pinnedMetrics';
import { formatVolumeForUnit, volumeFromMl } from '../utils/unitConversions';
import { formatTrendChange, formatTrendHeadline } from './HealthTrendTile';
import Icon from './Icon';

type GlanceStripProps = {
  metrics: readonly ResolvedPinnedMetric[];
  ringValues: Record<ActivityRingKey, ActivityRingValue>;
  /** Today against the goal for each nutrition and hydration metric; water in millilitres. */
  goalValues: Record<GoalMetricKey, ActivityRingValue>;
  trendSummaries: Partial<Record<HealthTrendKey, HealthTrendTileSummary>>;
  /** The window each trend covers, e.g. `7d`. */
  rangeFor: (key: HealthTrendKey) => string;
  weightUnit: string;
  waterUnit: string;
  onPressSettings?: () => void;
};

type ChipContent = {
  id: string;
  label: string;
  value: string;
  unit: string;
  detail: string;
  color: string;
};

/** One compact chip: a colour dot and name, the figure, and one line of context. */
const Chip: React.FC<{ chip: ChipContent }> = ({ chip }) => (
  <View
    testID={`glance-chip-${chip.id}`}
    accessible
    accessibilityLabel={`${chip.label}: ${chip.value}${chip.unit ? ` ${chip.unit}` : ''}, ${chip.detail}`}
    className="bg-surface rounded-xl px-3 py-2 shadow-sm min-w-[104px]"
  >
    <View className="flex-row items-center">
      <View
        className="w-2 h-2 rounded-full mr-1.5"
        style={{ backgroundColor: chip.color }}
      />
      <Text className="text-xs text-text-muted" numberOfLines={1}>
        {chip.label}
      </Text>
    </View>
    <Text className="text-text-primary text-base font-bold" numberOfLines={1}>
      {chip.value}
      {chip.unit ? (
        <Text className="text-text-muted text-xs font-normal">
          {` ${chip.unit}`}
        </Text>
      ) : null}
    </Text>
    <Text className="text-xs text-text-muted" numberOfLines={1}>
      {chip.detail}
    </Text>
  </View>
);

/**
 * A slim row of the few numbers worth seeing first: each metric is a small chip that
 * scrolls sideways when there are more than fit. Chips for metrics with no data, and in
 * automatic mode for metrics another visible card already shows, never reach this
 * component, so it only ever draws something useful.
 */
const GlanceStrip: React.FC<GlanceStripProps> = ({
  metrics,
  ringValues,
  goalValues,
  trendSummaries,
  rangeFor,
  weightUnit,
  waterUnit,
  onPressSettings,
}) => {
  const { t } = useTranslation();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const ringLook = useActivityRingLook();
  const goalLook = useGoalMetricLook(waterUnit);

  const ofGoal = (goal: string, unit: string): string =>
    t('pinnedMetrics.ofGoal', {
      defaultValue: 'of {{goal}} {{unit}}',
      goal,
      unit,
    });

  const chips: ChipContent[] = metrics.flatMap((metric): ChipContent[] => {
    if (metric.kind === 'ring') {
      const value = ringValues[metric.key];
      const unit = ringLook.units[metric.key];
      return [
        {
          id: metric.pinned,
          label: ACTIVITY_RING_LABELS[metric.key](t),
          value: formatLocalizedNumber(Math.round(value.current)),
          unit: '',
          detail:
            value.goal > 0
              ? ofGoal(formatLocalizedNumber(Math.round(value.goal)), unit)
              : unit,
          color: ringLook.colors[metric.key],
        },
      ];
    }
    if (metric.kind === 'goal') {
      const value = goalValues[metric.key];
      const unit = goalLook.units[metric.key];
      // Water arrives in millilitres and reads in the account's unit.
      const format = (amount: number): string =>
        metric.key === 'water'
          ? formatVolumeForUnit(volumeFromMl(amount, waterUnit), waterUnit)
          : formatLocalizedNumber(Math.round(amount));
      return [
        {
          id: metric.pinned,
          label: GOAL_METRIC_LABELS[metric.key](t),
          value: format(value.current),
          unit: '',
          detail: value.goal > 0 ? ofGoal(format(value.goal), unit) : unit,
          color: goalLook.colors[metric.key],
        },
      ];
    }
    const summary = trendSummaries[metric.key];
    if (!summary) return [];
    const { headline, unit } = formatTrendHeadline(
      metric.key,
      summary,
      weightUnit,
      waterUnit,
      t
    );
    return [
      {
        id: metric.pinned,
        label: HEALTH_TREND_LABELS[metric.key](t),
        value: headline,
        unit,
        detail: formatTrendChange(
          metric.key,
          summary,
          unit,
          rangeFor(metric.key)
        ),
        color: accentColor,
      },
    ];
  });

  return (
    <View className="mb-3">
      <Pressable
        onPress={onPressSettings}
        disabled={!onPressSettings}
        accessibilityRole={onPressSettings ? 'button' : undefined}
        className="flex-row justify-between items-center mb-2"
      >
        <Text className="text-sm font-bold text-text-secondary">
          {t('dashboard.pinnedMetrics', { defaultValue: 'At a Glance' })}
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {chips.map((chip) => (
          <Chip key={chip.id} chip={chip} />
        ))}
      </ScrollView>
    </View>
  );
};

export default GlanceStrip;
