import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSleepAnalytics } from '../hooks/useSleepAnalytics';
import { formatLocalizedNumber } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import TrendBarChart from '../components/TrendBarChart';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import StatusView from '../components/StatusView';
import type {
  SleepAnalyticsMetric,
  SleepAnalyticsPoint,
} from '../utils/sleepAnalytics';
import type { TrendRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type SleepAnalyticsScreenProps = RootStackScreenProps<'SleepAnalytics'>;

type MetricConfig = {
  key: SleepAnalyticsMetric;
  title: string;
  /** Unit appended to a value, already localized. */
  unit: string;
  maximumFractionDigits: number;
};

const getValue = (point: SleepAnalyticsPoint) => Math.max(0, point.value);

const formatSeconds = (
  seconds: number | null,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (seconds === null) return '-';
  const totalMinutes = Math.round(seconds / 60);
  return t('sleepAnalytics.duration', {
    defaultValue: '{{hours}}h {{minutes}}m',
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  });
};

const SleepAnalyticsScreen: React.FC<SleepAnalyticsScreenProps> = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>('30d');
  const { analytics, isLoading, isError } = useSleepAnalytics({ range });

  const header = useScreenHeader({
    title: t('sleepAnalytics.title', { defaultValue: 'Sleep Analytics' }),
    left: { kind: 'back' },
  });

  const metrics = useMemo<MetricConfig[]>(
    () => [
      {
        key: 'sleepScore',
        title: t('sleepAnalytics.metrics.sleepScore', {
          defaultValue: 'Sleep score',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
      {
        key: 'hrv',
        title: t('sleepAnalytics.metrics.hrv', {
          defaultValue: 'Overnight HRV',
        }),
        unit: ' ms',
        maximumFractionDigits: 0,
      },
      {
        key: 'restingHeartRate',
        title: t('sleepAnalytics.metrics.restingHeartRate', {
          defaultValue: 'Resting heart rate',
        }),
        unit: ' bpm',
        maximumFractionDigits: 0,
      },
      {
        key: 'spo2',
        title: t('sleepAnalytics.metrics.spo2', {
          defaultValue: 'Blood oxygen (SpO2)',
        }),
        unit: '%',
        maximumFractionDigits: 1,
      },
      {
        key: 'respiration',
        title: t('sleepAnalytics.metrics.respiration', {
          defaultValue: 'Respiration',
        }),
        unit: ' br/min',
        maximumFractionDigits: 1,
      },
      {
        key: 'stress',
        title: t('sleepAnalytics.metrics.stress', {
          defaultValue: 'Sleep stress',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
      {
        key: 'bodyBattery',
        title: t('sleepAnalytics.metrics.bodyBattery', {
          defaultValue: 'Body battery gained',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
    ],
    [t]
  );

  const formatMetric = useCallback(
    (value: number, metric: MetricConfig) =>
      `${formatLocalizedNumber(value, {
        maximumFractionDigits: metric.maximumFractionDigits,
      })}${metric.unit}`,
    []
  );

  if (!isLoading && !isError && analytics && analytics.nightsWithData === 0) {
    return (
      <ReportScreenLayout
        header={header}
        range={range}
        onRangeChange={setRange}
      >
        <StatusView
          icon="sleep-bedtime"
          iconTone="muted"
          inline
          title={t('sleepAnalytics.empty', {
            defaultValue: 'No sleep data in this period',
          })}
          subtitle={t('sleepAnalytics.emptyHint', {
            defaultValue: 'Sync your health data to see sleep trends.',
          })}
        />
      </ReportScreenLayout>
    );
  }

  const visibleMetrics = analytics
    ? metrics.filter((metric) => analytics.averages[metric.key] !== null)
    : [];

  const averageRows = visibleMetrics.map((metric) => ({
    label: metric.title,
    value: formatMetric(analytics?.averages[metric.key] ?? 0, metric),
    testID: `sleep-average-${metric.key}`,
  }));

  return (
    <ReportScreenLayout header={header} range={range} onRangeChange={setRange}>
      {isLoading || isError ? (
        <StatusView
          loading={isLoading}
          icon="sleep-bedtime"
          iconTone="muted"
          inline
          title={
            isError
              ? t('sleepAnalytics.loadFailed', {
                  defaultValue: 'Failed to load sleep data',
                })
              : undefined
          }
        />
      ) : (
        <View>
          {analytics ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.stages', {
                defaultValue: 'Average night',
              })}
              rows={[
                {
                  label: t('sleepAnalytics.stageDeep', {
                    defaultValue: 'Deep',
                  }),
                  value: formatSeconds(analytics.stages.deepSeconds, t),
                  testID: 'sleep-stage-deep',
                },
                {
                  label: t('sleepAnalytics.stageLight', {
                    defaultValue: 'Light',
                  }),
                  value: formatSeconds(analytics.stages.lightSeconds, t),
                  testID: 'sleep-stage-light',
                },
                {
                  label: t('sleepAnalytics.stageRem', { defaultValue: 'REM' }),
                  value: formatSeconds(analytics.stages.remSeconds, t),
                  testID: 'sleep-stage-rem',
                },
                {
                  label: t('sleepAnalytics.stageAwake', {
                    defaultValue: 'Awake',
                  }),
                  value: formatSeconds(analytics.stages.awakeSeconds, t),
                  testID: 'sleep-stage-awake',
                },
              ]}
            />
          ) : null}
          {visibleMetrics.map((metric) => (
            <TrendBarChart
              key={metric.key}
              data={analytics?.series[metric.key] ?? []}
              isLoading={false}
              isError={false}
              range={range}
              title={metric.title}
              getValue={getValue}
              formatTooltip={(point) =>
                t('sleepAnalytics.tooltip', {
                  defaultValue: '{{value}} · {{date}}',
                  value:
                    point.value > 0 ? formatMetric(point.value, metric) : '-',
                  date: formatTooltipDate(point.day),
                })
              }
              errorText=""
              emptyText=""
              testIDPrefix={`sleep-chart-${metric.key}`}
            />
          ))}
          {averageRows.length > 0 ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.averages', {
                defaultValue: 'Period averages',
              })}
              rows={averageRows}
            />
          ) : null}
        </View>
      )}
    </ReportScreenLayout>
  );
};

export default SleepAnalyticsScreen;
