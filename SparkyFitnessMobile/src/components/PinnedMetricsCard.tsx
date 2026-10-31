import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ACTIVITY_RING_LABELS } from '../constants/activityRings';
import type { ActivityRingKey } from '../constants/activityRings';
import type { HealthTrendKey } from '../constants/healthTrends';
import { useActivityRingLook } from '../hooks/useActivityRingLook';
import { useGoalMetricLook } from '../hooks/useGoalMetricLook';
import {
  GOAL_METRIC_LABELS,
  type GoalMetricKey,
} from '../constants/pinnedMetrics';
import { formatVolumeForUnit, volumeFromMl } from '../utils/unitConversions';
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
  /** Today against the goal for each nutrition and hydration metric; water in millilitres. */
  goalValues: Record<GoalMetricKey, ActivityRingValue>;
  trendSummaries: Partial<Record<HealthTrendKey, HealthTrendTileSummary>>;
  /** The window each pinned trend covers, e.g. `7d`. */
  rangeFor: (key: HealthTrendKey) => string;
  weightUnit: string;
  waterUnit: string;
  onPressSettings?: () => void;
};

/** A value against a daily goal: the figure, "of goal unit", and a small ring. */
const GoalTile: React.FC<{
  testID: string;
  label: string;
  current: string;
  goal: string | null;
  unit: string;
  progress: number;
  color: string;
  trackColor: string;
}> = ({ testID, label, current, goal, unit, progress, color, trackColor }) => {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${current}${goal ? ` / ${goal}` : ''} ${unit}`}
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
          {goal
            ? t('pinnedMetrics.ofGoal', {
                defaultValue: 'of {{goal}} {{unit}}',
                goal,
                unit,
              })
            : unit}
        </Text>
      </View>
      <ProgressRing
        progress={progress}
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
        color={color}
        backgroundColor={trackColor}
      />
    </View>
  );
};

const RingTile: React.FC<{
  ringKey: ActivityRingKey;
  value: ActivityRingValue;
}> = ({ ringKey, value }) => {
  const { t } = useTranslation();
  const { colors, units, trackColor } = useActivityRingLook();
  return (
    <GoalTile
      testID={`pinned-ring-${ringKey}`}
      label={ACTIVITY_RING_LABELS[ringKey](t)}
      current={formatLocalizedNumber(Math.round(value.current))}
      goal={
        value.goal > 0 ? formatLocalizedNumber(Math.round(value.goal)) : null
      }
      unit={units[ringKey]}
      progress={value.goal > 0 ? value.current / value.goal : 0}
      color={colors[ringKey]}
      trackColor={trackColor}
    />
  );
};

const NutritionGoalTile: React.FC<{
  goalKey: GoalMetricKey;
  value: ActivityRingValue;
  waterUnit: string;
}> = ({ goalKey, value, waterUnit }) => {
  const { t } = useTranslation();
  const { colors, units, trackColor } = useGoalMetricLook(waterUnit);
  // Water arrives in millilitres and reads in the account's unit; the rest are whole numbers.
  const format = (amount: number): string =>
    goalKey === 'water'
      ? formatVolumeForUnit(volumeFromMl(amount, waterUnit), waterUnit)
      : formatLocalizedNumber(Math.round(amount));
  return (
    <GoalTile
      testID={`pinned-goal-${goalKey}`}
      label={GOAL_METRIC_LABELS[goalKey](t)}
      current={format(value.current)}
      goal={value.goal > 0 ? format(value.goal) : null}
      unit={units[goalKey]}
      progress={value.goal > 0 ? value.current / value.goal : 0}
      color={colors[goalKey]}
      trackColor={trackColor}
    />
  );
};

/**
 * Up to six metrics the user chose, as small tiles at the top of the Dashboard: an
 * activity ring or a nutrition or hydration goal against its target, or a health trend's headline and sparkline.
 */
const PinnedMetricsCard: React.FC<PinnedMetricsCardProps> = ({
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
            if (metric.kind === 'goal') {
              return (
                <NutritionGoalTile
                  key={metric.pinned}
                  goalKey={metric.key}
                  value={goalValues[metric.key]}
                  waterUnit={waterUnit}
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
