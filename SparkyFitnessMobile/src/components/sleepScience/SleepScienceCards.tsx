import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { TFunction } from 'i18next';
import type { SleepDebtData } from '@workspace/shared';

import ReportSummaryCard, {
  type ReportSummaryRow,
} from '../reports/ReportSummaryCard';
import Button from '../ui/Button';
import {
  useChronotype,
  useEnergyCurve,
  useRecalculateSleepBaseline,
  useSleepBaseline,
  useSleepDataSufficiency,
  useSleepDebt,
} from '../../hooks/useSleepScience';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import {
  formatSleepClock,
  formatSleepSeconds,
} from '../../utils/sleepReportFormat';

/**
 * Sleep science cards for the Sleep Analytics report, the mobile side of the
 * web report's Sleep Science section. Each card fetches its own figure and
 * renders nothing until it has one, so a server without enough sleep data
 * just shows fewer cards.
 */

/** "HH:MM" from the server, as minutes after midnight. */
const clockStringToMinutes = (
  value: string | null | undefined
): number | null => {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const hourToMinutes = (hour: number | null | undefined): number | null =>
  hour == null ? null : hour * 60;

const hoursValue = (hours: number | null | undefined, t: TFunction) =>
  hours == null ? null : formatSleepSeconds(hours * 3600, t);

const basedOnDays = (days: number | undefined, t: TFunction) =>
  days
    ? t('sleepScience.basedOnDays', {
        defaultValue: 'Based on {{count}} days',
        defaultValue_one: 'Based on {{count}} day',
        defaultValue_other: 'Based on {{count}} days',
        count: days,
      })
    : undefined;

const confidenceLabel = (confidence: string, t: TFunction): string => {
  const labels: Record<string, string> = {
    low: t('sleepScience.confidenceLow', { defaultValue: 'Low confidence' }),
    medium: t('sleepScience.confidenceMedium', {
      defaultValue: 'Medium confidence',
    }),
    high: t('sleepScience.confidenceHigh', {
      defaultValue: 'High confidence',
    }),
  };
  return labels[confidence] ?? labels.low;
};

const debtLevelLabel = (
  level: SleepDebtData['debtCategory'],
  t: TFunction
): string => {
  const labels: Record<SleepDebtData['debtCategory'], string> = {
    low: t('sleepScience.debtLow', { defaultValue: 'Low' }),
    moderate: t('sleepScience.debtModerate', { defaultValue: 'Moderate' }),
    high: t('sleepScience.debtHigh', { defaultValue: 'High' }),
    critical: t('sleepScience.debtCritical', { defaultValue: 'Critical' }),
  };
  return labels[level];
};

const trendLabel = (
  direction: SleepDebtData['trend']['direction'],
  t: TFunction
): string => {
  const labels: Record<SleepDebtData['trend']['direction'], string> = {
    improving: t('sleepScience.trendImproving', {
      defaultValue: 'Improving',
    }),
    stable: t('sleepScience.trendStable', { defaultValue: 'Stable' }),
    worsening: t('sleepScience.trendWorsening', {
      defaultValue: 'Getting worse',
    }),
  };
  return labels[direction];
};

const energyZoneLabel = (zone: string | undefined, t: TFunction) => {
  const labels: Record<string, string> = {
    peak: t('sleepScience.zonePeak', { defaultValue: 'Peak' }),
    rising: t('sleepScience.zoneRising', { defaultValue: 'Rising' }),
    dip: t('sleepScience.zoneDip', { defaultValue: 'Dip' }),
    'wind-down': t('sleepScience.zoneWindDown', {
      defaultValue: 'Wind down',
    }),
    sleep: t('sleepScience.zoneSleep', { defaultValue: 'Sleep time' }),
  };
  return zone ? labels[zone] : undefined;
};

export const SleepDebtCard: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useSleepDebt();
  if (!data) return null;

  // The server reports more sleep than needed as a negative debt.
  const isSurplus = Math.round(data.currentDebt * 60) < 0;
  const rows: ReportSummaryRow[] = [
    {
      label: isSurplus
        ? t('sleepScience.sleepSurplus', { defaultValue: 'Sleep surplus' })
        : t('sleepScience.sleepDebt', { defaultValue: 'Sleep debt' }),
      value: formatSleepSeconds(Math.abs(data.currentDebt) * 3600, t),
      hint: isSurplus
        ? t('sleepScience.surplusHint', {
            defaultValue: "You're ahead on sleep",
          })
        : debtLevelLabel(data.debtCategory, t),
      testID: 'sleep-debt-current',
    },
    {
      label: t('sleepScience.trend', { defaultValue: 'Last 7 days' }),
      value: trendLabel(data.trend.direction, t),
      testID: 'sleep-debt-trend',
    },
  ];
  if (data.paybackTime > 0) {
    rows.push({
      label: t('sleepScience.payback', { defaultValue: 'Back on track in' }),
      value: t('sleepScience.paybackNights', {
        defaultValue: '{{count}} nights',
        defaultValue_one: '{{count}} night',
        defaultValue_other: '{{count}} nights',
        count: data.paybackTime,
      }),
      testID: 'sleep-debt-payback',
    });
  }

  return (
    <ReportSummaryCard
      testID="sleep-debt-card"
      title={t('sleepScience.debtTitle', { defaultValue: 'Sleep debt' })}
      rows={rows}
    />
  );
};

export const EnergyCard: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useEnergyCurve();
  if (!data?.success || data.currentEnergy == null) return null;

  const rows: ReportSummaryRow[] = [
    {
      label: t('sleepScience.energyNow', { defaultValue: 'Now' }),
      value: `${formatLocalizedNumber(Math.round(data.currentEnergy))}%`,
      hint: energyZoneLabel(data.currentZone, t),
      testID: 'sleep-energy-now',
    },
  ];
  if (data.nextPeak) {
    rows.push({
      label: t('sleepScience.nextPeak', { defaultValue: 'Next peak' }),
      value: formatSleepClock(hourToMinutes(data.nextPeak.hour)),
      testID: 'sleep-energy-peak',
    });
  }
  if (data.nextDip) {
    rows.push({
      label: t('sleepScience.nextDip', { defaultValue: 'Next dip' }),
      value: formatSleepClock(hourToMinutes(data.nextDip.hour)),
      testID: 'sleep-energy-dip',
    });
  }
  if (data.melatoninWindow) {
    rows.push({
      label: t('sleepScience.windDownFrom', { defaultValue: 'Wind down from' }),
      value: formatSleepClock(hourToMinutes(data.melatoninWindow.start)),
      hint: t('sleepScience.windDownHint', {
        defaultValue: 'When your body starts making melatonin',
      }),
      testID: 'sleep-energy-wind-down',
    });
  }

  return (
    <ReportSummaryCard
      testID="sleep-energy-card"
      title={t('sleepScience.energyTitle', { defaultValue: 'Energy today' })}
      rows={rows}
    />
  );
};

export const ChronotypeCard: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useChronotype();
  if (!data?.success || !data.chronotype) return null;

  const types = {
    early: t('sleepScience.chronotypeEarly', { defaultValue: 'Early bird' }),
    intermediate: t('sleepScience.chronotypeIntermediate', {
      defaultValue: 'Intermediate',
    }),
    late: t('sleepScience.chronotypeLate', { defaultValue: 'Night owl' }),
  };
  const timeRow = (
    label: string,
    value: string | null | undefined,
    testID: string,
    hint?: string
  ): ReportSummaryRow[] => {
    const minutes = clockStringToMinutes(value);
    return minutes === null
      ? []
      : [{ label, value: formatSleepClock(minutes), hint, testID }];
  };
  const melatoninStart = clockStringToMinutes(data.melatoninWindowStart);
  const melatoninEnd = clockStringToMinutes(data.melatoninWindowEnd);

  const rows: ReportSummaryRow[] = [
    {
      label: t('sleepScience.chronotype', { defaultValue: 'Type' }),
      value: types[data.chronotype],
      hint: basedOnDays(data.basedOnDays, t),
      testID: 'sleep-chronotype-type',
    },
    ...timeRow(
      t('sleepScience.avgWake', { defaultValue: 'Average wake time' }),
      data.averageWakeTime,
      'sleep-chronotype-wake'
    ),
    ...timeRow(
      t('sleepScience.avgBedtime', { defaultValue: 'Average bedtime' }),
      data.averageSleepTime,
      'sleep-chronotype-sleep'
    ),
    ...timeRow(
      t('sleepScience.energyLow', { defaultValue: 'Body clock low' }),
      data.circadianNadir,
      'sleep-chronotype-nadir',
      t('sleepScience.energyLowHint', {
        defaultValue: 'Your least alert time, usually asleep',
      })
    ),
    ...timeRow(
      t('sleepScience.energyHigh', { defaultValue: 'Body clock high' }),
      data.circadianAcrophase,
      'sleep-chronotype-acrophase',
      t('sleepScience.energyHighHint', {
        defaultValue: 'Your most alert time of day',
      })
    ),
    ...(melatoninStart !== null && melatoninEnd !== null
      ? [
          {
            label: t('sleepScience.melatoninWindow', {
              defaultValue: 'Melatonin window',
            }),
            value: t('sleepScience.timeRange', {
              defaultValue: '{{start}} – {{end}}',
              start: formatSleepClock(melatoninStart),
              end: formatSleepClock(melatoninEnd),
            }),
            testID: 'sleep-chronotype-melatonin',
          },
        ]
      : []),
  ];

  return (
    <ReportSummaryCard
      testID="sleep-chronotype-card"
      title={t('sleepScience.chronotypeTitle', { defaultValue: 'Chronotype' })}
      rows={rows}
    />
  );
};

export const SleepBaselineCard: React.FC = () => {
  const { t } = useTranslation();
  const { data: stats } = useSleepBaseline();
  const { data: sufficiency } = useSleepDataSufficiency();
  const recalculate = useRecalculateSleepBaseline();

  if (!stats && !sufficiency) return null;

  const profile = stats?.profile ?? null;
  const rows: ReportSummaryRow[] = [];
  if (profile) {
    rows.push({
      label: t('sleepScience.baselineNeed', { defaultValue: 'Baseline need' }),
      value: formatSleepSeconds(profile.baselineSleepNeed * 3600, t),
      hint: confidenceLabel(profile.confidence, t),
      testID: 'sleep-baseline-need',
    });
    const workday = hoursValue(profile.sdWorkday, t);
    if (workday) {
      rows.push({
        label: t('sleepScience.workdaySleep', {
          defaultValue: 'Sleep on workdays',
        }),
        value: workday,
        testID: 'sleep-baseline-workday',
      });
    }
    const freeday = hoursValue(profile.sdFreeday, t);
    if (freeday) {
      rows.push({
        label: t('sleepScience.freedaySleep', {
          defaultValue: 'Sleep on days off',
        }),
        value: freeday,
        testID: 'sleep-baseline-freeday',
      });
    }
    const jetlag = hoursValue(profile.socialJetlag, t);
    if (jetlag) {
      rows.push({
        label: t('sleepScience.socialJetlag', {
          defaultValue: 'Social jetlag',
        }),
        value: jetlag,
        hint: t('sleepScience.socialJetlagHint', {
          defaultValue: 'How far your sleep shifts on days off',
        }),
        testID: 'sleep-baseline-jetlag',
      });
    }
    if (profile.lastCalculated) {
      rows.push({
        label: t('sleepScience.lastCalculated', {
          defaultValue: 'Last calculated',
        }),
        value: new Date(profile.lastCalculated).toLocaleDateString(
          getAppLocale(),
          { dateStyle: 'medium' }
        ),
        hint: basedOnDays(profile.basedOnDays, t),
        testID: 'sleep-baseline-calculated',
      });
    }
  }

  const onRecalculate = () =>
    recalculate.mutate(undefined, {
      onSuccess: (result) =>
        Toast.show(
          result.success
            ? {
                type: 'success',
                text1: t('sleepScience.recalculated', {
                  defaultValue: 'Baseline sleep need updated',
                }),
              }
            : {
                type: 'error',
                text1: t('sleepScience.recalculateNotEnough', {
                  defaultValue: 'Not enough sleep data yet',
                }),
              }
        ),
      onError: () =>
        Toast.show({
          type: 'error',
          text1: t('sleepScience.recalculateFailed', {
            defaultValue: 'Could not recalculate',
          }),
        }),
    });

  const footer = (
    <View className="mt-2">
      {sufficiency && !sufficiency.sufficient ? (
        <Text
          testID="sleep-baseline-more-data"
          className="text-text-muted text-xs mb-2"
        >
          {t('sleepScience.moreDataNeeded', {
            defaultValue:
              'More data needed: {{workdays}}/{{workdaysNeeded}} workdays and {{freedays}}/{{freedaysNeeded}} days off.',
            workdays: sufficiency.workdaysAvailable,
            workdaysNeeded: sufficiency.workdaysNeeded,
            freedays: sufficiency.freedaysAvailable,
            freedaysNeeded: sufficiency.freedaysNeeded,
          })}
        </Text>
      ) : null}
      {!profile ? (
        <Text className="text-text-secondary text-sm mb-2">
          {t('sleepScience.baselineNotCalculated', {
            defaultValue:
              'Your baseline sleep need has not been calculated yet.',
          })}
        </Text>
      ) : null}
      {(sufficiency?.totalDays ?? 0) > 0 ? (
        <Button
          testID="sleep-baseline-recalculate"
          variant="outline"
          loading={recalculate.isPending}
          onPress={onRecalculate}
        >
          {t('sleepScience.recalculate', { defaultValue: 'Recalculate' })}
        </Button>
      ) : null}
    </View>
  );

  return (
    <ReportSummaryCard
      testID="sleep-baseline-card"
      title={t('sleepScience.baselineTitle', {
        defaultValue: 'Baseline sleep need',
      })}
      rows={rows}
      footer={footer}
    />
  );
};
