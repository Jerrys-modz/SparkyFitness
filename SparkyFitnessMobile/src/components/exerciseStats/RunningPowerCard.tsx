import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  HEART_RATE_ZONE_COLORS,
  computeTimeInPowerZones,
  estimateCriticalPower,
  runSensorSeries,
  runningPowerZoneFloors,
  summarizeRunningPower,
  type RunSensorPoint,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import RunSeriesChart from './RunSeriesChart';

interface RunningPowerCardProps {
  points: readonly RunSensorPoint[];
}

const Stat: React.FC<{ label: string; value: string; testID: string }> = ({
  label,
  value,
  testID,
}) => (
  <View className="w-1/2 py-1.5" testID={testID}>
    <Text className="text-text-secondary text-xs">{label}</Text>
    <Text className="text-text-primary text-base font-semibold">{value}</Text>
  </View>
);

/**
 * Power for one run: average, normalized power, how even the effort was and,
 * once the run holds a hard 20 minutes, time in five power zones. Renders
 * nothing for a run with under a minute of power.
 */
const RunningPowerCard: React.FC<RunningPowerCardProps> = ({ points }) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

  const summary = useMemo(() => summarizeRunningPower(points), [points]);
  const criticalPower = useMemo(() => estimateCriticalPower(points), [points]);
  const zones = useMemo(
    () =>
      criticalPower ? computeTimeInPowerZones(points, criticalPower) : null,
    [points, criticalPower]
  );
  const floors = useMemo(
    () => (criticalPower ? runningPowerZoneFloors(criticalPower) : []),
    [criticalPower]
  );
  const series = useMemo(() => runSensorSeries(points, 'power'), [points]);

  if (!summary) return null;

  const watts = (value: number) =>
    t('exerciseStatistics.runPower.watts', {
      value: formatLocalizedNumber(value),
      defaultValue: '{{value}} W',
    });
  const totalZoneSeconds = zones?.reduce((sum, s) => sum + s, 0) ?? 0;

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
      testID="running-power-card"
    >
      <Text className="text-text-primary text-base font-bold mb-3">
        {t('exerciseStatistics.runPower.title', {
          defaultValue: 'Running Power',
        })}
      </Text>
      <View className="flex-row flex-wrap mb-2">
        <Stat
          testID="run-power-average"
          label={t('exerciseStatistics.runPower.average', {
            defaultValue: 'Average',
          })}
          value={watts(summary.averageWatts)}
        />
        <Stat
          testID="run-power-max"
          label={t('exerciseStatistics.runPower.max', { defaultValue: 'Max' })}
          value={watts(summary.maxWatts)}
        />
        {summary.normalizedWatts !== null ? (
          <Stat
            testID="run-power-normalized"
            label={t('exerciseStatistics.runPower.normalized', {
              defaultValue: 'Normalized',
            })}
            value={watts(summary.normalizedWatts)}
          />
        ) : null}
        {summary.variabilityIndex !== null ? (
          <Stat
            testID="run-power-variability"
            label={t('exerciseStatistics.runPower.variability', {
              defaultValue: 'Variability index',
            })}
            value={formatLocalizedNumber(summary.variabilityIndex, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          />
        ) : null}
        {summary.decouplingPercent !== null ? (
          <Stat
            testID="run-power-decoupling"
            label={t('exerciseStatistics.runPower.decoupling', {
              defaultValue: 'Power to heart rate drift',
            })}
            value={t('exerciseStatistics.runPower.percent', {
              value: formatLocalizedNumber(summary.decouplingPercent, {
                maximumFractionDigits: 1,
              }),
              defaultValue: '{{value}}%',
            })}
          />
        ) : null}
      </View>

      {series.length >= 2 ? (
        <RunSeriesChart
          data={series}
          color={accent}
          xAxisCaption={t('exerciseStatistics.cardio.minutesAxis', {
            defaultValue: 'Minutes from start',
          })}
        />
      ) : null}

      {zones && criticalPower && totalZoneSeconds > 0 ? (
        <View className="mt-4" testID="run-power-zones">
          <Text className="text-text-primary text-sm font-semibold">
            {t('exerciseStatistics.runPower.zones', {
              defaultValue: 'Power zones',
            })}
          </Text>
          <Text className="text-text-muted text-xs mb-2.5">
            {t('exerciseStatistics.runPower.zonesBasis', {
              value: formatLocalizedNumber(criticalPower),
              defaultValue:
                'Zones from a critical power of {{value}} W, estimated as 95% of this run’s best 20 minutes. An easy run under-estimates it, so read zones from a hard effort.',
            })}
          </Text>
          {zones.map((seconds, index) => {
            const minutes = Math.round(seconds / 60);
            return (
              <View key={index} className="mb-2.5">
                <View className="flex-row justify-between mb-1">
                  <Text className="text-text-primary text-sm">
                    {t('exerciseStatistics.cardio.zone', {
                      defaultValue: 'Zone {{zone}}',
                      zone: index + 1,
                    })}
                    <Text className="text-text-muted text-xs">
                      {'  '}
                      {t('exerciseStatistics.runPower.zoneFrom', {
                        value: formatLocalizedNumber(floors[index] ?? 0),
                        defaultValue: 'from {{value}} W',
                      })}
                    </Text>
                  </Text>
                  <Text className="text-text-secondary text-sm">
                    {seconds > 0 && seconds < 60
                      ? t('exerciseStatistics.cardio.underOneMinute', {
                          defaultValue: '<1 min',
                        })
                      : t('exerciseStatistics.cardio.minutes', {
                          count: minutes,
                          formattedCount: formatLocalizedNumber(minutes),
                          defaultValue: '{{formattedCount}} min',
                          defaultValue_one: '{{formattedCount}} min',
                          defaultValue_other: '{{formattedCount}} min',
                        })}
                  </Text>
                </View>
                <View className="h-2 rounded-full bg-progress-track overflow-hidden">
                  <View
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.round((seconds / totalZoneSeconds) * 100)}%`,
                      backgroundColor: HEART_RATE_ZONE_COLORS[index],
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

export default RunningPowerCard;
