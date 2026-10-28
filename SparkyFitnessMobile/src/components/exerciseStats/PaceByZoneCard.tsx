import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useCSSVariable } from 'uniwind';
import type { PaceByZone } from '@workspace/shared';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import { formatPace } from '../../utils/gpsRecording';

interface PaceByZoneCardProps {
  zones: readonly PaceByZone[];
  distanceUnit: 'km' | 'miles';
}

const KM_PER_MILE = 1.609344;

// Resolvers rather than key strings: the i18n audit needs the literal key at
// each call site, and a total record makes a new zone a compile error.
type Direction = 'faster' | 'slower' | 'steady';

const ZONE_COPY: Record<
  2 | 3,
  {
    name: (t: TFunction) => string;
    hint: (t: TFunction) => string;
    insight: (
      t: TFunction,
      direction: Direction,
      change: string,
      months: number
    ) => string;
  }
> = {
  2: {
    name: (t) =>
      t('exerciseStatistics.paceByZone.zone2', {
        defaultValue: 'Zone 2 Easy Aerobic',
      }),
    hint: (t) =>
      t('exerciseStatistics.paceByZone.zone2Hint', {
        defaultValue: 'Monthly average pace for low-intensity efforts.',
      }),
    insight: (t, direction, change, months) =>
      direction === 'faster'
        ? t('exerciseStatistics.paceByZone.zone2Faster', {
            change,
            count: months,
            defaultValue:
              'Aerobic fitness improving ({{change}} over {{count}} months)',
            defaultValue_one:
              'Aerobic fitness improving ({{change}} over {{count}} month)',
            defaultValue_other:
              'Aerobic fitness improving ({{change}} over {{count}} months)',
          })
        : direction === 'slower'
          ? t('exerciseStatistics.paceByZone.zone2Slower', {
              change,
              count: months,
              defaultValue:
                'Easy pace slowing ({{change}} over {{count}} months)',
              defaultValue_one:
                'Easy pace slowing ({{change}} over {{count}} month)',
              defaultValue_other:
                'Easy pace slowing ({{change}} over {{count}} months)',
            })
          : t('exerciseStatistics.paceByZone.zone2Steady', {
              count: months,
              defaultValue: 'Easy pace steady over {{count}} months',
              defaultValue_one: 'Easy pace steady over {{count}} month',
              defaultValue_other: 'Easy pace steady over {{count}} months',
            }),
  },
  3: {
    name: (t) =>
      t('exerciseStatistics.paceByZone.zone3', {
        defaultValue: 'Zone 3 Tempo',
      }),
    hint: (t) =>
      t('exerciseStatistics.paceByZone.zone3Hint', {
        defaultValue: 'Monthly average pace for moderate-intensity efforts.',
      }),
    insight: (t, direction, change, months) =>
      direction === 'faster'
        ? t('exerciseStatistics.paceByZone.zone3Faster', {
            change,
            count: months,
            defaultValue:
              'Tempo fitness improving ({{change}} over {{count}} months)',
            defaultValue_one:
              'Tempo fitness improving ({{change}} over {{count}} month)',
            defaultValue_other:
              'Tempo fitness improving ({{change}} over {{count}} months)',
          })
        : direction === 'slower'
          ? t('exerciseStatistics.paceByZone.zone3Slower', {
              change,
              count: months,
              defaultValue:
                'Tempo pace slowing ({{change}} over {{count}} months)',
              defaultValue_one:
                'Tempo pace slowing ({{change}} over {{count}} month)',
              defaultValue_other:
                'Tempo pace slowing ({{change}} over {{count}} months)',
            })
          : t('exerciseStatistics.paceByZone.zone3Steady', {
              count: months,
              defaultValue: 'Tempo pace steady over {{count}} months',
              defaultValue_one: 'Tempo pace steady over {{count}} month',
              defaultValue_other: 'Tempo pace steady over {{count}} months',
            }),
  },
};

const monthLabel = (month: string): string =>
  new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)) - 1,
    1
  ).toLocaleDateString(getAppLocale(), { month: 'short' });

/** "-5s" / "+2s" for a change in seconds, in the display unit. */
const signedSeconds = (seconds: number, unit: string): string => {
  const rounded = Math.round(seconds);
  const sign = rounded < 0 ? '-' : rounded > 0 ? '+' : '';
  return `${sign}${formatLocalizedNumber(Math.abs(rounded))}${unit}`;
};

/**
 * Monthly average running pace in heart-rate zones 2 and 3: how fast the
 * person runs at the same effort. Each month shows its pace and the change
 * from the month before, and each zone ends in a one-line verdict. Shown only
 * when at least one zone has a run in the window.
 */
const PaceByZoneCard: React.FC<PaceByZoneCardProps> = ({
  zones,
  distanceUnit,
}) => {
  const { t } = useTranslation();
  const successGlyph = useCSSVariable('--color-icon-success') as string;
  const perUnit = distanceUnit === 'miles' ? KM_PER_MILE : 1;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('exerciseStatistics.paceZones.perMile', { defaultValue: '/mi' })
      : t('exerciseStatistics.paceZones.perKm', { defaultValue: '/km' });
  const secondsLabel = t('exerciseStatistics.paceByZone.secondsShort', {
    defaultValue: 's',
  });

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold">
        {t('exerciseStatistics.paceByZone.title', {
          defaultValue: 'Pace by Heart Rate Zone',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-1 mb-3">
        {t('exerciseStatistics.paceByZone.subtitle', {
          defaultValue:
            'Pace trends matched to your heart rate zones, using monthly averages from your runs.',
        })}
      </Text>
      {zones.map((zone) => {
        const copy = ZONE_COPY[zone.zone as 2 | 3];
        if (!copy) return null;
        const trend = zone.trend;
        return (
          <View
            key={zone.zone}
            testID={`pace-zone-${zone.zone}`}
            className="bg-raised rounded-xl p-3 mt-3"
          >
            <Text className="text-text-primary text-base font-semibold">
              {copy.name(t)}
            </Text>
            <Text className="text-text-muted text-xs mt-1">{copy.hint(t)}</Text>
            <View className="flex-row mt-3">
              {zone.months.map((month) => (
                <View key={month.month} className="flex-1">
                  <Text className="text-text-muted text-xs font-semibold uppercase">
                    {monthLabel(month.month)}
                  </Text>
                  <Text className="text-text-primary text-base font-semibold mt-1">
                    {formatPace(
                      month.paceSecondsPerKm == null
                        ? null
                        : month.paceSecondsPerKm * perUnit
                    )}
                    <Text className="text-text-muted text-xs font-normal">
                      {month.paceSecondsPerKm == null ? '' : unitLabel}
                    </Text>
                  </Text>
                  {month.changeSeconds == null ? (
                    <Text className="text-text-muted text-xs mt-0.5">
                      {month.paceSecondsPerKm == null ? ' ' : '—'}
                    </Text>
                  ) : (
                    <Text
                      className="text-xs font-semibold mt-0.5"
                      style={
                        month.changeSeconds < 0
                          ? { color: successGlyph }
                          : undefined
                      }
                    >
                      {signedSeconds(
                        month.changeSeconds * perUnit,
                        secondsLabel
                      )}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {trend ? (
              <View className="flex-row items-center mt-3 pt-3 border-t border-border-subtle">
                <View
                  className="w-2 h-2 rounded-full mr-2 bg-text-muted"
                  style={
                    trend.direction === 'faster'
                      ? { backgroundColor: successGlyph }
                      : undefined
                  }
                />
                <Text className="text-text-secondary text-xs flex-1">
                  {copy.insight(
                    t,
                    trend.direction,
                    signedSeconds(trend.changeSeconds * perUnit, secondsLabel),
                    trend.months
                  )}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

export default PaceByZoneCard;
