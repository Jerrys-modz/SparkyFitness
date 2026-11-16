import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  APPETITE_SCORE_MAX,
  type AppetiteTrendDay,
  type AppetiteTrendSummary,
} from '@workspace/shared';

import ReportSummaryCard, { type ReportSummaryRow } from './ReportSummaryCard';
import { appetiteMetricLabel } from '../../utils/appetiteLabels';
import { formatLocalizedNumber } from '../../localization';

const BAR_HEIGHT = 48;

/**
 * Hunger, fullness and cravings over the report window, under the calorie
 * chart: a day-by-day hunger strip, the averages, and what was eaten on
 * hungrier days against the others. Renders nothing until a score exists.
 */
const AppetiteReportCard: React.FC<{
  days: AppetiteTrendDay[];
  summary: AppetiteTrendSummary;
  /** Formats kcal in the account's energy unit. */
  formatEnergy: (kcal: number) => string;
}> = ({ days, summary, formatEnergy }) => {
  const { t } = useTranslation();
  if (summary.daysLogged === 0) return null;

  const score = (value: number | null) =>
    value === null
      ? '–'
      : t('appetite.report.score', {
          defaultValue: '{{value}} / 10',
          value: formatLocalizedNumber(value, { maximumFractionDigits: 1 }),
        });

  const rows: ReportSummaryRow[] = [
    {
      label: appetiteMetricLabel('hunger', 'appetite', t),
      value: score(summary.averageHunger),
    },
    {
      label: appetiteMetricLabel('fullness', 'appetite', t),
      value: score(summary.averageFullness),
    },
    {
      label: appetiteMetricLabel('food_noise', 'appetite', t),
      value: score(summary.averageCravings),
    },
  ];
  if (
    summary.caloriesOnHungrierDays !== null &&
    summary.caloriesOnLessHungryDays !== null
  ) {
    rows.push(
      {
        label: t('appetite.report.hungrierDays', {
          defaultValue: 'Eaten on hungrier days',
        }),
        value: formatEnergy(summary.caloriesOnHungrierDays),
      },
      {
        label: t('appetite.report.otherDays', {
          defaultValue: 'Eaten on other days',
        }),
        value: formatEnergy(summary.caloriesOnLessHungryDays),
      }
    );
  }

  return (
    <View>
      <View
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        accessible
        accessibilityLabel={t('appetite.report.chartLabel', {
          defaultValue: 'Hunger by day, next to calories eaten',
        })}
      >
        <Text className="text-base font-semibold text-text-primary">
          {t('appetite.report.title', { defaultValue: 'Hunger & fullness' })}
        </Text>
        <Text className="text-xs text-text-muted mt-0.5 mb-3">
          {t('appetite.report.daysLogged', {
            defaultValue: 'Average of {{count}} logged days, from 0 to 10',
            count: summary.daysLogged,
          })}
        </Text>
        <View
          className="flex-row items-end gap-0.5"
          style={{ height: BAR_HEIGHT }}
        >
          {days.map((day) => (
            <View
              key={day.date}
              testID={`appetite-bar-${day.date}`}
              className={
                day.hunger === null
                  ? 'flex-1'
                  : 'flex-1 rounded-sm bg-orange-400'
              }
              style={{
                height:
                  day.hunger === null
                    ? 0
                    : Math.max(
                        2,
                        (day.hunger / APPETITE_SCORE_MAX) * BAR_HEIGHT
                      ),
              }}
            />
          ))}
        </View>
      </View>
      <ReportSummaryCard
        title={t('appetite.report.averages', {
          defaultValue: 'Hunger & fullness averages',
        })}
        rows={rows}
      />
    </View>
  );
};

export default AppetiteReportCard;
