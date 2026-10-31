import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  ACTIVITY_RING_LABELS,
  type ActivityRingKey,
} from '../constants/activityRings';
import { formatLocalizedNumber } from '../localization/i18n';
import type { ActivityRingData } from '../utils/activityRings';
import Icon from './Icon';
import ProgressRing from './ProgressRing';

const OUTER_SIZE = 132;
const STROKE_WIDTH = 12;
const RING_GAP = 3;
const RING_STEP = (STROKE_WIDTH + RING_GAP) * 2;

type ActivityRingsCardProps = {
  rings: readonly ActivityRingData[];
  /** Opens Activity Rings settings from the card's header. */
  onPressSettings?: () => void;
};

const ActivityRingsCard: React.FC<ActivityRingsCardProps> = ({
  rings,
  onPressSettings,
}) => {
  const { t } = useTranslation();
  // Metric tokens (DESIGN.md section 2): watch-measured active energy for Move, Exercise
  // Mint for exercise minutes, and Sparky Blue for steps like the steps trend.
  // Active points are derived from heart rate zones, so they take Heart-Rate Red.
  const [moveColor, exerciseColor, stepsColor, trackColor, pointsColor] =
    useCSSVariable([
      '--color-active-energy',
      '--color-exercise',
      '--color-accent-primary',
      '--color-progress-track',
      '--color-heart-rate',
    ]) as [string, string, string, string, string];
  const accentColor = stepsColor;
  const colors: Record<ActivityRingKey, string> = {
    move: moveColor,
    exercise: exerciseColor,
    steps: stepsColor,
    points: pointsColor,
  };
  const units: Record<ActivityRingKey, string> = {
    move: t('nutrition.caloriesUnit', { defaultValue: 'Cal' }),
    exercise: t('activityRings.minutesUnit', { defaultValue: 'min' }),
    steps: t('activityRings.stepsUnit', { defaultValue: 'steps' }),
    points: t('activityRings.pointsUnit', { defaultValue: 'pts' }),
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Pressable
        onPress={onPressSettings}
        disabled={!onPressSettings}
        accessibilityRole={onPressSettings ? 'button' : undefined}
        className="flex-row justify-between items-center mb-4"
      >
        <Text className="text-sm font-bold text-text-secondary">
          {t('dashboard.activityRings', { defaultValue: 'Activity Rings' })}
        </Text>
        {onPressSettings ? (
          <View className="flex-row items-center">
            <Text className="text-xs font-semibold text-accent-primary mr-1">
              {t('dashboard.activityRingsSettings', {
                defaultValue: 'Settings',
              })}
            </Text>
            <Icon name="chevron-forward" size={14} color={accentColor} />
          </View>
        ) : null}
      </Pressable>
      <View className="flex-row items-center">
        <View
          style={{ width: OUTER_SIZE, height: OUTER_SIZE }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {rings.map((ring, index) => {
            const size = OUTER_SIZE - index * RING_STEP;
            const inset = (OUTER_SIZE - size) / 2;
            return (
              <View
                key={ring.key}
                testID={`activity-ring-${ring.key}`}
                style={{ position: 'absolute', top: inset, left: inset }}
              >
                <ProgressRing
                  progress={ring.progress}
                  size={size}
                  strokeWidth={STROKE_WIDTH}
                  color={colors[ring.key]}
                  backgroundColor={trackColor}
                />
              </View>
            );
          })}
        </View>
        <View className="flex-1 ml-4">
          {rings.map((ring) => {
            const label = ACTIVITY_RING_LABELS[ring.key](t);
            const current = formatLocalizedNumber(Math.round(ring.current));
            const goal = formatLocalizedNumber(Math.round(ring.goal));
            const value = ring.goal > 0 ? `${current} / ${goal}` : current;
            return (
              <View
                key={ring.key}
                className="mb-2"
                accessible
                accessibilityLabel={`${label}: ${value} ${units[ring.key]}`}
              >
                <View className="flex-row items-center">
                  <View
                    className="w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: colors[ring.key] }}
                  />
                  <Text className="text-xs text-text-muted" numberOfLines={1}>
                    {label}
                  </Text>
                </View>
                <Text
                  className="text-text-primary text-xl font-semibold"
                  numberOfLines={1}
                >
                  {value}
                  <Text className="text-text-muted text-xs font-normal">
                    {` ${units[ring.key]}`}
                  </Text>
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default ActivityRingsCard;
