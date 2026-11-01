import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { ACTIVITY_RING_LABELS } from '../constants/activityRings';
import { useActivityRingLook } from '../hooks/useActivityRingLook';
import { formatLocalizedNumber } from '../localization/i18n';
import type { ActivityRingData } from '../utils/activityRings';
import Icon from './Icon';
import ProgressRing from './ProgressRing';

const OUTER_SIZE = 132;
/** With four or more rings the stack grows and the legend tightens, so the two stay level. */
const LARGE_OUTER_SIZE = 168;
const MANY_RINGS = 4;
/** Compact draws smaller, thinner rings and puts each legend entry on one line. */
const COMPACT_OUTER_SIZE = 96;
const STROKE_WIDTH = 12;
const RING_GAP = 3;
const COMPACT_STROKE_WIDTH = 9;
const COMPACT_RING_GAP = 2;

type ActivityRingsCardProps = {
  rings: readonly ActivityRingData[];
  /** Opens Activity Rings settings from the card's header. */
  onPressSettings?: () => void;
  /** The smaller layout: thinner rings and one-line legend entries. */
  compact?: boolean;
};

const ActivityRingsCard: React.FC<ActivityRingsCardProps> = ({
  rings,
  onPressSettings,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { colors, units, trackColor } = useActivityRingLook();
  const hasMany = rings.length >= MANY_RINGS;
  const outerSize = compact
    ? COMPACT_OUTER_SIZE
    : hasMany
      ? LARGE_OUTER_SIZE
      : OUTER_SIZE;
  const strokeWidth = compact ? COMPACT_STROKE_WIDTH : STROKE_WIDTH;
  const ringStep = (strokeWidth + (compact ? COMPACT_RING_GAP : RING_GAP)) * 2;
  const accentColor = colors.steps;

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
          style={{ width: outerSize, height: outerSize }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {rings.map((ring, index) => {
            const size = outerSize - index * ringStep;
            const inset = (outerSize - size) / 2;
            return (
              <View
                key={ring.key}
                testID={`activity-ring-${ring.key}`}
                style={{ position: 'absolute', top: inset, left: inset }}
              >
                <ProgressRing
                  progress={ring.progress}
                  size={size}
                  strokeWidth={strokeWidth}
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
            if (compact) {
              return (
                <View
                  key={ring.key}
                  className="flex-row items-center mb-1"
                  accessible
                  accessibilityLabel={`${label}: ${value} ${units[ring.key]}`}
                >
                  <View
                    className="w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: colors[ring.key] }}
                  />
                  <Text
                    className="text-xs text-text-muted flex-1"
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <Text
                    className="text-text-primary text-sm font-semibold"
                    numberOfLines={1}
                  >
                    {value}
                    <Text className="text-text-muted text-xs font-normal">
                      {` ${units[ring.key]}`}
                    </Text>
                  </Text>
                </View>
              );
            }
            return (
              <View
                key={ring.key}
                className={hasMany ? 'mb-1.5' : 'mb-2'}
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
                  className={`text-text-primary font-semibold ${
                    hasMany ? 'text-lg' : 'text-xl'
                  }`}
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
