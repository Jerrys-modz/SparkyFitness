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
  // Steps takes the cyan macro hue, not the accent blue: next to Move's blue-violet the
  // two read as one colour on the nested rings.
  const [
    moveColor,
    exerciseColor,
    stepsColor,
    trackColor,
    accentColor,
    pointsColor,
  ] = useCSSVariable([
    '--color-calories',
    '--color-exercise',
    '--color-macro-fat',
    '--color-progress-track',
    '--color-accent-primary',
    '--color-macro-protein',
  ]) as [string, string, string, string, string, string];
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
        <Text className="text-md font-bold text-text-secondary">
          {t('dashboard.activityRings', { defaultValue: 'Activity Rings' })}
        </Text>
        {onPressSettings ? (
          <Icon name="chevron-forward" size={14} color={accentColor} />
        ) : null}
      </Pressable>
      <View className="flex-row items-center">
        <View style={{ width: OUTER_SIZE, height: OUTER_SIZE }}>
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
          {rings.map((ring) => (
            <View key={ring.key} className="mb-2">
              <Text
                className="text-xs font-semibold"
                style={{ color: colors[ring.key] }}
              >
                {ACTIVITY_RING_LABELS[ring.key](t)}
              </Text>
              <Text className="text-text-primary text-base font-bold">
                {ring.goal > 0
                  ? `${formatLocalizedNumber(Math.round(ring.current))} / ${formatLocalizedNumber(Math.round(ring.goal))}`
                  : formatLocalizedNumber(Math.round(ring.current))}
                <Text className="text-text-muted text-xs font-normal">
                  {` ${units[ring.key]}`}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default ActivityRingsCard;
