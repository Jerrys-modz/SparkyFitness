import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMoodReport } from '../hooks/useMoodReport';
import { formatLocalizedNumber } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import TrendBarChart from '../components/TrendBarChart';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import {
  moodForValue,
  moodTagLabel,
  type MoodDayPoint,
} from '../utils/moodReport';
import type { TrendRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type MoodReportScreenProps = RootStackScreenProps<'MoodReport'>;

const getMoodValue = (point: MoodDayPoint) => point.value;

const MoodReportScreen: React.FC<MoodReportScreenProps> = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>('30d');
  const { report, isLoading, isError } = useMoodReport({ range });

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

  const rows = [
    {
      label: t('moodReport.averageMood', { defaultValue: 'Average mood' }),
      value:
        report?.averageValue != null
          ? `${averageMood ? `${averageMood.emoji} ${averageMood.name} · ` : ''}${formatLocalizedNumber(
              Math.round(report.averageValue)
            )}`
          : '-',
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
