import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMoodReport } from '../hooks/useMoodReport';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import TrendBarChart from '../components/TrendBarChart';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import {
  moodForValue,
  moodTagLabel,
  type MoodDayPoint,
} from '../utils/moodReport';
import { TREND_RANGE_DAYS, type TrendRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type MoodReportScreenProps = RootStackScreenProps<'MoodReport'>;

const getMoodValue = (point: MoodDayPoint) => point.value;

const MoodReportScreen: React.FC<MoodReportScreenProps> = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>('30d');
  const { report, previousReport, isLoading, isError } = useMoodReport({
    range,
  });
  const days = TREND_RANGE_DAYS[range];

  const header = useScreenHeader({
    title: t('moodReport.title', { defaultValue: 'Mood' }),
    left: { kind: 'back' },
  });

  const formatTooltip = useCallback(
    (point: MoodDayPoint) => {
      const mood = point.value > 0 ? moodForValue(point.value) : null;
      return t('moodReport.tooltip', {
        defaultValue: '{{mood}} · {{date}}',
        mood: mood ? `${mood.emoji} ${mood.name}` : '-',
        date: formatTooltipDate(point.day),
      });
    },
    [t]
  );

  const averageMood =
    report?.averageValue != null ? moodForValue(report.averageValue) : null;

  const previousAverage = previousReport?.averageValue ?? null;
  const averageDiff =
    report?.averageValue != null && previousAverage !== null
      ? Math.round(report.averageValue - previousAverage)
      : null;
  const averageHint =
    averageDiff === null
      ? undefined
      : t('moodReport.changeHint', {
          defaultValue: '{{change}} vs previous {{days}} days',
          change: `${averageDiff > 0 ? '+' : ''}${formatLocalizedNumber(averageDiff)}`,
          days,
        });

  const dayRow = (
    label: string,
    point: MoodDayPoint | null,
    testID: string
  ) => {
    const mood = point ? moodForValue(point.value) : null;
    return point
      ? [
          {
            label,
            value: mood ? `${mood.emoji} ${mood.name}` : '-',
            hint: formatTooltipDate(point.day),
            testID,
          },
        ]
      : [];
  };

  const weekdayName = (weekday: number) =>
    // 2000-01-02 was a Sunday, so day 2 + weekday lands on that weekday.
    new Date(2000, 0, 2 + weekday).toLocaleDateString(getAppLocale(), {
      weekday: 'long',
    });

  const rows = [
    {
      label: t('moodReport.averageMood', { defaultValue: 'Average mood' }),
      value:
        report?.averageValue != null
          ? `${averageMood ? `${averageMood.emoji} ${averageMood.name} · ` : ''}${formatLocalizedNumber(
              Math.round(report.averageValue)
            )}`
          : '-',
      hint: averageHint,
      testID: 'mood-average',
    },
    {
      label: t('moodReport.daysLogged', { defaultValue: 'Days logged' }),
      value: formatLocalizedNumber(report?.loggedDays ?? 0),
      testID: 'mood-days-logged',
    },
  ];

  return (
    <ReportScreenLayout header={header} range={range} onRangeChange={setRange}>
      <TrendBarChart
        data={report?.days ?? []}
        isLoading={isLoading}
        isError={isError}
        range={range}
        title={t('moodReport.chartTitle', { defaultValue: 'Daily mood' })}
        getValue={getMoodValue}
        formatTooltip={formatTooltip}
        formatYLabel={(value) => formatLocalizedNumber(Math.round(value))}
        errorText={t('moodReport.loadFailed', {
          defaultValue: 'Failed to load mood entries',
        })}
        emptyText={t('moodReport.empty', {
          defaultValue: 'No mood entries in this period',
        })}
        testIDPrefix="mood-chart"
      />
      {report && report.loggedDays > 0 ? (
        <>
          <ReportSummaryCard
            title={t('moodReport.summary', { defaultValue: 'Summary' })}
            rows={rows}
          />
          {report.best ? (
            <ReportSummaryCard
              title={t('moodReport.highlights', { defaultValue: 'Highlights' })}
              rows={[
                ...dayRow(
                  t('moodReport.bestDay', { defaultValue: 'Best day' }),
                  report.best,
                  'mood-best-day'
                ),
                ...dayRow(
                  t('moodReport.lowestDay', { defaultValue: 'Lowest day' }),
                  report.lowest,
                  'mood-lowest-day'
                ),
              ]}
            />
          ) : null}
          {report.weekdayAverages.length > 1 ? (
            <ReportSummaryCard
              title={t('moodReport.byWeekday', {
                defaultValue: 'Average by weekday',
              })}
              rows={report.weekdayAverages.map(({ weekday, value }) => {
                const mood = moodForValue(value);
                return {
                  label: weekdayName(weekday),
                  value: mood ? `${mood.emoji} ${mood.name}` : '-',
                  testID: `mood-weekday-${weekday}`,
                };
              })}
            />
          ) : null}
          {report.topTags.length > 0 ? (
            <ReportSummaryCard
              title={t('moodReport.topMoods', { defaultValue: 'Most logged' })}
              rows={report.topTags.map(({ tag, count }) => ({
                label: moodTagLabel(tag),
                value: formatLocalizedNumber(count),
                testID: `mood-tag-${tag}`,
              }))}
            />
          ) : null}
        </>
      ) : null}
    </ReportScreenLayout>
  );
};

export default MoodReportScreen;
