import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RunningTrends } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { distanceFromKm } from '../../utils/unitConversions';

interface RunningTrendsCardProps {
  trends: RunningTrends;
  distanceUnit: 'km' | 'miles';
}

const BAR_AREA_HEIGHT = 72;

/**
 * The last twelve weeks of running: a bar per week, how this week compares
 * with the four before it, the longest run, and whether efficiency (distance
 * per heartbeat) has moved. Shown only when there are runs in the window.
 */
const RunningTrendsCard: React.FC<RunningTrendsCardProps> = ({
  trends,
  distanceUnit,
}) => {
  const { t } = useTranslation();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const toUnit = (meters: number) =>
    distanceFromKm(meters / 1000, distanceUnit);
  const number = (value: number, digits = 1) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const peak = Math.max(...trends.weeks.map((w) => w.distanceMeters), 1);
  const percent = trends.weekVsAveragePercent;
  const efficiency = trends.efficiencyChangePercent;

  return (
    <View className="bg-surface rounded-xl p-4 mb-4">
      <Text className="text-text-primary text-base font-bold mb-1">
        {t('exerciseStatistics.cardio.trends.title', {
          defaultValue: 'Running, last 12 weeks',
        })}
      </Text>
      <Text className="text-text-primary text-2xl font-bold">
        {number(toUnit(trends.thisWeekMeters))} {unitLabel}
      </Text>
      <Text className="text-text-secondary text-xs mb-3">
        {percent == null
          ? t('exerciseStatistics.cardio.trends.thisWeek', {
              defaultValue: 'This week',
            })
          : percent >= 0
            ? t('exerciseStatistics.cardio.trends.thisWeekAbove', {
                defaultValue:
                  'This week, {{percent}}% above your recent average',
                percent: number(Math.abs(percent), 0),
              })
            : t('exerciseStatistics.cardio.trends.thisWeekBelow', {
                defaultValue:
                  'This week, {{percent}}% below your recent average',
                percent: number(Math.abs(percent), 0),
              })}
      </Text>

      <View
        className="flex-row items-end"
        style={{ height: BAR_AREA_HEIGHT }}
        accessibilityLabel={t('exerciseStatistics.cardio.trends.chartA11y', {
          defaultValue: 'Weekly running distance for the last 12 weeks',
        })}
      >
        {trends.weeks.map((week, index) => {
          const isCurrent = index === trends.weeks.length - 1;
          return (
            <View
              key={week.weekStart}
              testID={`running-week-${week.weekStart}`}
              className={`flex-1 mx-0.5 rounded-t ${
                isCurrent ? 'bg-accent-primary' : 'bg-text-muted'
              }`}
              style={{
                height: Math.max(
                  week.distanceMeters > 0 ? 3 : 1,
                  (week.distanceMeters / peak) * BAR_AREA_HEIGHT
                ),
                opacity: week.distanceMeters > 0 ? 1 : 0.3,
              }}
            />
          );
        })}
      </View>

      <View className="flex-row mt-4">
        <View className="flex-1">
          <Text className="text-text-secondary text-xs">
            {t('exerciseStatistics.cardio.trends.longestRun', {
              defaultValue: 'Longest run',
            })}
          </Text>
          <Text className="text-text-primary text-base font-semibold">
            {number(toUnit(trends.longestRunMeters))} {unitLabel}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-text-secondary text-xs">
            {t('exerciseStatistics.cardio.trends.efficiency', {
              defaultValue: 'Efficiency',
            })}
          </Text>
          <Text
            className="text-text-primary text-base font-semibold"
            testID="running-efficiency"
          >
            {efficiency == null
              ? '—'
              : `${efficiency > 0 ? '+' : ''}${number(efficiency, 1)}%`}
          </Text>
        </View>
      </View>
      <Text className="text-text-muted text-xs mt-2">
        {t('exerciseStatistics.cardio.trends.efficiencyHint', {
          defaultValue:
            'Efficiency is distance per heartbeat on runs of 20 minutes or more, earlier weeks against recent ones. Higher means fitter at the same effort.',
        })}
      </Text>
    </View>
  );
};

export default RunningTrendsCard;
