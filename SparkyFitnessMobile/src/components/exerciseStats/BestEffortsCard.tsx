import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  formatRaceTime,
  type BestEffortBoardItem,
  type BestEffortId,
} from '@workspace/shared';
import { getAppLocale } from '../../localization';
import { bestEffortIdsForUnit } from '../../utils/bestEfforts';
import {
  METERS_PER_KM,
  METERS_PER_MILE,
  formatPace,
  paceSecondsPerUnit,
} from '../../utils/gpsRecording';

// Resolvers rather than key strings: the i18n audit needs the literal key at
// each call site, and a total record makes a new distance a compile error.
export const BEST_EFFORT_LABELS: Record<
  BestEffortId,
  (t: TFunction) => string
> = {
  '1k': (t) =>
    t('exerciseStatistics.cardio.bestEfforts.d1k', { defaultValue: '1 km' }),
  '1mi': (t) =>
    t('exerciseStatistics.cardio.bestEfforts.d1mi', {
      defaultValue: '1 mile',
    }),
  '5k': (t) =>
    t('exerciseStatistics.cardio.bestEfforts.d5k', { defaultValue: '5 km' }),
  '10k': (t) =>
    t('exerciseStatistics.cardio.bestEfforts.d10k', { defaultValue: '10 km' }),
  half_marathon: (t) =>
    t('exerciseStatistics.cardio.bestEfforts.dHalf', {
      defaultValue: 'Half marathon',
    }),
};

/** Pace over an effort, as `m:ss /km` or `m:ss /mi`. */
export function effortPaceText(
  t: TFunction,
  distanceMeters: number,
  seconds: number,
  distanceUnit: 'km' | 'miles'
): string {
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unit =
    distanceUnit === 'miles'
      ? t('exerciseStatistics.cardio.perMile', { defaultValue: '/mi' })
      : t('exerciseStatistics.cardio.perKm', { defaultValue: '/km' });
  return `${formatPace(paceSecondsPerUnit(distanceMeters, seconds, unitMeters))} ${unit}`;
}

function dayText(day: string): string {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(
    getAppLocale(),
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );
}

interface BestEffortsCardProps {
  efforts: readonly BestEffortBoardItem[];
  distanceUnit: 'km' | 'miles';
  runsAnalyzed: number;
  truncated: boolean;
}

/**
 * The fastest stretch of each distance found inside any run, however long the
 * run it came from was. Distances no run reaches yet are left out.
 */
const BestEffortsCard: React.FC<BestEffortsCardProps> = ({
  efforts,
  distanceUnit,
  runsAnalyzed,
  truncated,
}) => {
  const { t } = useTranslation();
  const rows = bestEffortIdsForUnit(distanceUnit)
    .map((id) => efforts.find((effort) => effort.id === id))
    .filter((effort): effort is BestEffortBoardItem => effort !== undefined);

  return (
    <View className="bg-surface rounded-xl p-4 mb-4" testID="best-efforts-card">
      <Text className="text-text-primary text-base font-bold mb-1">
        {t('exerciseStatistics.cardio.bestEfforts.title', {
          defaultValue: 'Best efforts',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mb-2">
        {t('exerciseStatistics.cardio.bestEfforts.subtitle', {
          defaultValue:
            'Your fastest stretch of each distance, found inside any run.',
        })}
      </Text>
      {rows.length === 0 ? (
        <Text className="text-text-muted text-sm">
          {t('exerciseStatistics.cardio.bestEfforts.empty', {
            defaultValue:
              'Record or sync a run with a GPS route of at least 1 km to see your best efforts.',
          })}
        </Text>
      ) : (
        rows.map((effort) => (
          <View
            key={effort.id}
            testID={`best-effort-${effort.id}`}
            className="flex-row justify-between items-center py-1.5"
          >
            <View className="flex-1 pr-2">
              <Text className="text-text-primary text-sm font-semibold">
                {BEST_EFFORT_LABELS[effort.id](t)}
              </Text>
              <Text className="text-text-muted text-xs">
                {dayText(effort.achievedAt)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-text-primary text-base font-semibold">
                {formatRaceTime(effort.seconds)}
              </Text>
              <Text className="text-text-secondary text-xs">
                {effortPaceText(
                  t,
                  effort.distanceMeters,
                  effort.seconds,
                  distanceUnit
                )}
              </Text>
            </View>
          </View>
        ))
      )}
      <Text className="text-text-muted text-xs mt-2">
        {truncated
          ? t('exerciseStatistics.cardio.bestEfforts.truncated', {
              defaultValue:
                'Searched your {{count}} most recent runs with a route.',
              defaultValue_one:
                'Searched your {{count}} most recent run with a route.',
              defaultValue_other:
                'Searched your {{count}} most recent runs with a route.',
              count: runsAnalyzed,
            })
          : t('exerciseStatistics.cardio.bestEfforts.hint', {
              defaultValue:
                'Searched {{count}} runs with a route. A stretch never spans a pause or a gap in the recording.',
              defaultValue_one:
                'Searched {{count}} run with a route. A stretch never spans a pause or a gap in the recording.',
              defaultValue_other:
                'Searched {{count}} runs with a route. A stretch never spans a pause or a gap in the recording.',
              count: runsAnalyzed,
            })}
      </Text>
    </View>
  );
};

export default BestEffortsCard;
