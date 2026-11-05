import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { formatLocalizedNumber } from '../../localization';
import { useSleepDay } from '../../hooks/useSleepDay';
import { buildStageShares } from '../SleepStagesBreakdown';
import { formatSleepDuration } from '../../utils/sleepDay';
import { localizeSleepStage } from '../../utils/sleepLocalization';
import DashboardCardHeader from './DashboardCardHeader';
import StatusBadge from './StatusBadge';

interface SleepDashboardCardProps {
  date: string;
  onOpenSleep: (entryId: string, day: string) => void;
}

const STAGE_BAR_HEIGHT = 8;

/**
 * Last night's sleep on the Wellness tab: time asleep, the sleep score, resting heart
 * rate and HRV when a watch recorded them, and the stages as one bar. The night shown is
 * the one filed under the selected day (the day you woke up), the same night as the
 * Diary's Wake Up card. Nothing shows until a night has synced, and nothing shows to a
 * delegate who may not see sleep.
 */
const SleepDashboardCard: React.FC<SleepDashboardCardProps> = ({
  date,
  onOpenSleep,
}) => {
  const { t } = useTranslation();
  const [teal, blue, violet, orange, heartRed] = useCSSVariable([
    '--color-cat-teal',
    '--color-cat-blue',
    '--color-cat-violet',
    '--color-cat-orange',
    '--color-heart-rate',
  ]) as [string, string, string, string, string];
  const stageColor: Record<string, string> = {
    '--color-cat-teal': teal,
    '--color-cat-blue': blue,
    '--color-cat-violet': violet,
    '--color-cat-orange': orange,
  };
  const { wakeUp: night, isForbidden } = useSleepDay(date);

  if (!night || isForbidden) return null;

  const asleepSeconds =
    night.time_asleep_in_seconds ?? night.duration_in_seconds;
  const shares = buildStageShares(night);
  const score = night.sleep_score;
  const vitals: {
    key: string;
    value: string;
    label: string;
    color?: string;
  }[] = [];
  if (night.resting_heart_rate != null) {
    vitals.push({
      key: 'rhr',
      value: t('dashboard.sleepCard.bpm', {
        defaultValue: '{{value}} bpm',
        value: formatLocalizedNumber(Math.round(night.resting_heart_rate)),
      }),
      label: t('dashboard.sleepCard.restingHr', {
        defaultValue: 'Resting HR',
      }),
      color: heartRed,
    });
  }
  if (night.avg_overnight_hrv != null) {
    vitals.push({
      key: 'hrv',
      value: t('dashboard.sleepCard.ms', {
        defaultValue: '{{value}} ms',
        value: formatLocalizedNumber(Math.round(night.avg_overnight_hrv)),
      }),
      label: t('dashboard.sleepCard.hrv', { defaultValue: 'HRV' }),
    });
  }

  return (
    <Pressable
      testID="sleep-dashboard-card"
      onPress={() => onOpenSleep(night.id, date)}
      accessibilityRole="button"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="sleep-score"
        title={t('dashboard.sleepCard.title', { defaultValue: 'Sleep' })}
        badge={
          score != null ? (
            <StatusBadge
              label={t('dashboard.sleepCard.score', {
                defaultValue: 'Score {{score}}',
                score: formatLocalizedNumber(Math.round(score)),
              })}
              tone={
                score >= 80 ? 'success' : score >= 60 ? 'neutral' : 'warning'
              }
            />
          ) : undefined
        }
        actionLabel={t('common.details', { defaultValue: 'Details' })}
        onPressAction={() => onOpenSleep(night.id, date)}
      />
      <View className="flex-row items-end justify-between mb-3">
        <View className="flex-shrink">
          <Text className="text-3xl font-bold text-text-primary">
            {formatSleepDuration(asleepSeconds, t)}
          </Text>
          <Text className="text-xs text-text-muted">
            {t('dashboard.sleepCard.timeAsleep', {
              defaultValue: 'Time asleep',
            })}
          </Text>
        </View>
        <View className="flex-row gap-4">
          {vitals.map((vital) => (
            <View key={vital.key} className="items-end">
              <Text
                className="text-base font-semibold text-text-primary"
                style={vital.color ? { color: vital.color } : undefined}
              >
                {vital.value}
              </Text>
              <Text className="text-xs text-text-muted">{vital.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {shares.length > 0 && (
        <>
          <Text className="text-xs text-text-muted mb-1">
            {t('dashboard.sleepCard.stages', { defaultValue: 'Sleep stages' })}
          </Text>
          <View
            testID="sleep-dashboard-card-stages"
            className="flex-row rounded-full overflow-hidden mb-2"
            style={{ height: STAGE_BAR_HEIGHT }}
          >
            {shares.map((share) => (
              <View
                key={share.definition.key}
                style={{
                  flex: share.seconds,
                  backgroundColor: stageColor[share.definition.colorVariable],
                }}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {shares.map((share) => (
              <View
                key={share.definition.key}
                className="flex-row items-center gap-1"
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: stageColor[share.definition.colorVariable],
                  }}
                />
                <Text className="text-xs text-text-secondary">
                  {localizeSleepStage(t, share.definition.key)}{' '}
                  {formatSleepDuration(share.seconds, t)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Pressable>
  );
};

export default SleepDashboardCard;
