import React from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useHydrationReport } from '../hooks/useHydrationReport';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { usePreferences, useServerConnection } from '../hooks';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import HydrationBarChart from '../components/HydrationBarChart';
import StatusView from '../components/StatusView';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  volumeFromMl,
} from '../utils/unitConversions';
import { TREND_RANGE_DAYS } from '../utils/trendRange';
import { percentChange } from '../utils/nutritionReport';
import type { RootStackScreenProps } from '../types/navigation';

type HydrationReportScreenProps = RootStackScreenProps<'HydrationReport'>;

const HydrationReportScreen: React.FC<HydrationReportScreenProps> = () => {
  const { t } = useTranslation();
  const { range, setRange, isSectionShown } = useReportCustomization();
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const { report, isLoading, isError } = useHydrationReport({ range });
  const days = TREND_RANGE_DAYS[range];
  const unit = preferences?.water_display_unit ?? 'ml';

  const header = useScreenHeader({
    title: t('hydrationReport.title', { defaultValue: 'Hydration' }),
    left: { kind: 'back' },
  });

  const volume = (ml: number) =>
    t('hydrationReport.volume', {
      defaultValue: '{{value}} {{unit}}',
      value: formatVolumeForUnit(volumeFromMl(ml, unit), unit),
      unit: WATER_UNIT_LABELS[unit] ?? unit,
    });
  const weekdayName = (weekday: number) =>
    // 2000-01-02 was a Sunday, so day 2 + weekday lands on that weekday.
    new Date(2000, 0, 2 + weekday).toLocaleDateString(getAppLocale(), {
      weekday: 'long',
    });

  if (isLoading || isError) {
    return (
      <ReportScreenLayout
        header={header}
        range={range}
        onRangeChange={setRange}
      >
        <StatusView
          loading={isLoading}
          icon="chart-bar"
          iconTone="muted"
          inline
          title={
            isError
              ? t('hydrationReport.loadFailed', {
                  defaultValue: 'Failed to load hydration data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const insights = report?.insights ?? null;
  const hasData = !!insights && insights.loggedDays > 0;
  const change = percentChange(
    insights?.averageMl ?? null,
    insights?.previousAverageMl ?? null
  );
  const changeText =
    change === null || change === 0
      ? undefined
      : `${change > 0 ? '+' : ''}${formatLocalizedNumber(change)}%`;

  const highlights: ReportHighlight[] =
    hasData && insights && insights.averageMl !== null
      ? [
          {
            label: t('hydrationReport.dailyAverage', {
              defaultValue: 'Daily average',
            }),
            value: volume(insights.averageMl),
            change: changeText,
            changeTone:
              change === null || change === 0
                ? 'neutral'
                : change > 0
                  ? 'positive'
                  : 'negative',
            testID: 'hydration-highlight-average',
          },
          ...(insights.daysWithGoal > 0
            ? [
                {
                  label: t('hydrationReport.goalsMet', {
                    defaultValue: 'Goals met',
                  }),
                  value: t('hydrationReport.goalsMetValue', {
                    defaultValue: '{{met}} of {{total}} days',
                    met: insights.goalsMet,
                    total: insights.daysWithGoal,
                  }),
                  testID: 'hydration-highlight-goals',
                },
              ]
            : []),
          {
            label: t('hydrationReport.daysLogged', {
              defaultValue: 'Days logged',
            }),
            value: t('hydrationReport.daysOfWindow', {
              defaultValue: '{{logged}} of {{total}}',
              logged: insights.loggedDays,
              total: days,
            }),
            testID: 'hydration-highlight-days',
          },
          {
            label: t('hydrationReport.total', { defaultValue: 'Total' }),
            value: volume(insights.totalMl),
            testID: 'hydration-highlight-total',
          },
        ]
      : [];

  const dayRow = (
    label: string,
    point: { day: string; milliliters: number } | null,
    testID: string
  ) =>
    point
      ? [
          {
            label,
            value: volume(point.milliliters),
            hint: formatTooltipDate(point.day),
            testID,
          },
        ]
      : [];

  return (
    <ReportScreenLayout header={header} range={range} onRangeChange={setRange}>
      {isSectionShown('hydration.overview') && highlights.length > 0 ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('hydration.chart') ? (
        <HydrationBarChart
          data={report?.series ?? []}
          isLoading={false}
          isError={false}
          range={range}
          unit={unit}
          goals={report?.goals}
        />
      ) : null}
      {hasData && insights ? (
        <>
          {isSectionShown('hydration.goal') && insights.daysWithGoal > 0 ? (
            <ReportSummaryCard
              title={t('hydrationReport.goalTitle', {
                defaultValue: 'Water goal',
              })}
              rows={[
                {
                  label: t('hydrationReport.averageVsGoal', {
                    defaultValue: 'Average vs goal',
                  }),
                  value: `${formatLocalizedNumber(insights.averageGoalPct ?? 0)}%`,
                  testID: 'hydration-goal-average',
                },
                {
                  label: t('hydrationReport.currentStreak', {
                    defaultValue: 'Current streak',
                  }),
                  value: t('hydrationReport.daysCount', {
                    defaultValue: '{{count}} days',
                    count: insights.goalStreak,
                  }),
                  testID: 'hydration-streak-current',
                },
                {
                  label: t('hydrationReport.longestStreak', {
                    defaultValue: 'Longest streak',
                  }),
                  value: t('hydrationReport.daysCount', {
                    defaultValue: '{{count}} days',
                    count: insights.longestGoalStreak,
                  }),
                  testID: 'hydration-streak-longest',
                },
              ]}
            />
          ) : null}
          {isSectionShown('hydration.highlights') && insights.bestDay ? (
            <ReportSummaryCard
              title={t('hydrationReport.highlights', {
                defaultValue: 'Highlights',
              })}
              rows={[
                ...dayRow(
                  t('hydrationReport.bestDay', { defaultValue: 'Best day' }),
                  insights.bestDay,
                  'hydration-best-day'
                ),
                ...dayRow(
                  t('hydrationReport.lowestDay', {
                    defaultValue: 'Lowest logged day',
                  }),
                  insights.lowestDay,
                  'hydration-lowest-day'
                ),
              ]}
            />
          ) : null}
          {isSectionShown('hydration.weekdays') &&
          insights.weekdayAverages.length > 1 ? (
            <ReportSummaryCard
              title={t('hydrationReport.byWeekday', {
                defaultValue: 'Average by weekday',
              })}
              rows={insights.weekdayAverages.map(({ weekday, averageMl }) => ({
                label: weekdayName(weekday),
                value: volume(averageMl),
                testID: `hydration-weekday-${weekday}`,
              }))}
            />
          ) : null}
        </>
      ) : (
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('hydrationReport.empty', {
            defaultValue: 'No water logged in this period',
          })}
        />
      )}
    </ReportScreenLayout>
  );
};

export default HydrationReportScreen;
