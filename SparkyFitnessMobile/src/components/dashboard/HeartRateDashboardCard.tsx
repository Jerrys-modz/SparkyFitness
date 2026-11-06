import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  HEART_RATE_ZONE_COLORS,
  type ExerciseSessionResponse,
} from '@workspace/shared';

import { useHealthTrends } from '../../hooks/useHealthTrends';
import { useWorkoutHeartRateZones } from '../../hooks/useWorkoutHeartRateZones';
import { formatLocalizedNumber } from '../../localization';
import DashboardCardHeader from './DashboardCardHeader';
import StatusBadge from './StatusBadge';

interface HeartRateDashboardCardProps {
  date: string;
  sessions: ExerciseSessionResponse[];
  onOpenReport: () => void;
}

const ZONE_BAR_HEIGHT = 8;

/**
 * Heart rate on the Activity tab: the day's resting heart rate against the average of
 * the days before it, and, when the day's workouts carry heart rate, the time spent in
 * each of the five zones. Zones are the stored ones from the shared zone rules, never
 * recomputed here. Opens the Heart Rate report.
 */
const HeartRateDashboardCard: React.FC<HeartRateDashboardCardProps> = ({
  date,
  sessions,
  onOpenReport,
}) => {
  const { t } = useTranslation();
  const heartRed = useCSSVariable('--color-heart-rate') as string;
  const { heartRate } = useHealthTrends({
    range: '7d',
    activeTrends: ['heartRate'],
  });
  const zones = useWorkoutHeartRateZones(
    sessions.flatMap((session) =>
      session.type === 'preset' ? session.exercises : [session]
    )
  );

  const today = heartRate.data.find((point) => point.day === date);
  const earlier = heartRate.data.filter(
    (point) => point.day < date && point.restingHr > 0
  );
  const average =
    earlier.length > 0
      ? earlier.reduce((sum, point) => sum + point.restingHr, 0) /
        earlier.length
      : null;
  const resting = today && today.restingHr > 0 ? today.restingHr : null;
  const delta =
    resting != null && average != null ? Math.round(resting - average) : null;

  if (resting == null && !zones) return null;

  return (
    <Pressable
      testID="heart-rate-dashboard-card"
      onPress={onOpenReport}
      accessibilityRole="button"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="heart-rate"
        title={t('dashboard.heartRateCard.title', {
          defaultValue: 'Heart Rate',
        })}
        actionLabel={t('common.details', { defaultValue: 'Details' })}
        onPressAction={onOpenReport}
      />
      {resting != null && (
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-baseline gap-2">
            <Text className="text-3xl font-bold" style={{ color: heartRed }}>
              {formatLocalizedNumber(Math.round(resting))}
            </Text>
            <Text className="text-sm text-text-secondary">
              {t('dashboard.heartRateCard.restingBpm', {
                defaultValue: 'bpm resting',
              })}
            </Text>
          </View>
          {delta != null && delta !== 0 && (
            <StatusBadge
              label={t('dashboard.heartRateCard.vsAverage', {
                defaultValue: '{{delta}} bpm vs 7d avg',
                delta: `${delta > 0 ? '+' : '−'}${formatLocalizedNumber(Math.abs(delta))}`,
              })}
              // A lower resting heart rate than usual is the good direction.
              tone={delta < 0 ? 'success' : 'warning'}
            />
          )}
        </View>
      )}
      {zones && (
        <>
          <View
            testID="heart-rate-dashboard-card-zones"
            className="flex-row rounded-full overflow-hidden mb-2"
            style={{ height: ZONE_BAR_HEIGHT }}
          >
            {zones.map((row) => (
              <View
                key={row.zone}
                style={{
                  flex: row.seconds,
                  backgroundColor:
                    HEART_RATE_ZONE_COLORS[
                      Math.min(Math.max(row.zone, 1), 5) - 1
                    ],
                }}
              />
            ))}
          </View>
          <View className="flex-row gap-1.5">
            {zones.map((row) => (
              <View
                key={row.zone}
                className="flex-1 items-center bg-raised rounded-lg py-1.5"
              >
                <Text className="text-xs text-text-muted">
                  {t('dashboard.heartRateCard.zone', {
                    defaultValue: 'Zone {{zone}}',
                    zone: row.zone,
                  })}
                </Text>
                <Text className="text-sm font-semibold text-text-primary">
                  {t('dashboard.heartRateCard.share', {
                    defaultValue: '{{percent}}%',
                    percent: formatLocalizedNumber(Math.round(row.share * 100)),
                  })}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Pressable>
  );
};

export default HeartRateDashboardCard;
