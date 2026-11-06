import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ReadinessLevel } from '@workspace/shared';

import { formatLocalizedNumber } from '../../localization';
import { useFitnessFatigue } from '../../hooks/useFitnessFatigue';
import {
  readinessFactorLabel,
  readinessLevelText,
} from '../../utils/readinessCopy';
import ProgressRing from '../ProgressRing';
import DashboardCardHeader from './DashboardCardHeader';
import StatusBadge, { type StatusBadgeTone } from './StatusBadge';

interface ReadinessDashboardCardProps {
  /** Readiness is worked out for today only, so the card shows only on today. */
  isToday: boolean;
  onOpenDetails: () => void;
}

const RING_SIZE = 64;
const RING_STROKE = 7;

const LEVEL_TONE: Record<ReadinessLevel, StatusBadgeTone> = {
  noData: 'neutral',
  low: 'danger',
  moderate: 'warning',
  high: 'success',
};

const LEVEL_RING_VARIABLE: Record<ReadinessLevel, string> = {
  noData: '--color-text-muted',
  low: '--color-text-danger-subtle',
  moderate: '--color-text-warning',
  high: '--color-icon-success',
};

/**
 * Today's 0 to 100 readiness on the Wellness tab: the score in a ring, what it means for
 * training, and the weakest input when one is pulling it down. The server works the score
 * out from training form, sleep and, when a watch recorded them, resting heart rate and
 * HRV; this card only draws it. A tap opens Exercise Statistics, where every factor is
 * explained.
 */
const ReadinessDashboardCard: React.FC<ReadinessDashboardCardProps> = ({
  isToday,
  onOpenDetails,
}) => {
  const { t } = useTranslation();
  const { data } = useFitnessFatigue(isToday);
  const readiness = data?.readiness;
  const [ringColor, trackColor] = useCSSVariable([
    LEVEL_RING_VARIABLE[readiness?.level ?? 'noData'],
    '--color-progress-track',
  ]) as [string, string];

  if (!isToday || !readiness || readiness.score == null) return null;

  const levelLabel = (() => {
    switch (readiness.level) {
      case 'high':
        return t('dashboard.readinessCard.levelHigh', {
          defaultValue: 'Ready',
        });
      case 'moderate':
        return t('dashboard.readinessCard.levelModerate', {
          defaultValue: 'Fine',
        });
      case 'low':
        return t('dashboard.readinessCard.levelLow', {
          defaultValue: 'Take it easy',
        });
      default:
        return null;
    }
  })();
  const weakestScore =
    readiness.weakest != null
      ? readiness.factors[readiness.weakest]
      : undefined;
  // Name the weakest input only when it is actually low, not on a good day.
  const showWeakest =
    readiness.weakest != null && weakestScore != null && weakestScore < 60;

  return (
    <Pressable
      testID="readiness-dashboard-card"
      onPress={onOpenDetails}
      accessibilityRole="button"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="heart-rate"
        title={t('dashboard.readinessCard.title', {
          defaultValue: 'Readiness',
        })}
        actionLabel={t('common.details', { defaultValue: 'Details' })}
        onPressAction={onOpenDetails}
      />
      <View className="flex-row items-center gap-4">
        <View
          style={{ width: RING_SIZE, height: RING_SIZE }}
          className="items-center justify-center"
        >
          <ProgressRing
            progress={readiness.score / 100}
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            color={ringColor}
            backgroundColor={trackColor}
          />
          <Text
            className="text-xl font-bold text-text-primary"
            style={{ position: 'absolute' }}
          >
            {formatLocalizedNumber(Math.round(readiness.score))}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-base font-semibold text-text-primary">
              {t('dashboard.readinessCard.score', {
                defaultValue: 'Readiness score',
              })}
            </Text>
            {levelLabel && (
              <StatusBadge
                label={levelLabel}
                tone={LEVEL_TONE[readiness.level]}
              />
            )}
          </View>
          <Text className="text-sm text-text-secondary">
            {readinessLevelText(readiness.level, t)}
          </Text>
          {showWeakest && readiness.weakest != null && (
            <Text className="text-xs text-text-muted mt-1">
              {t('dashboard.readinessCard.weakest', {
                defaultValue: 'Held back most by {{factor}}',
                factor: readinessFactorLabel(readiness.weakest, t),
              })}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
};

export default ReadinessDashboardCard;
