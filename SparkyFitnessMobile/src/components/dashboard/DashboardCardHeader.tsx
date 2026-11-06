import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon, { type IconName } from '../Icon';

interface DashboardCardHeaderProps {
  icon: IconName;
  title: string;
  /** Quiet status beside the title, such as a `StatusBadge`. */
  badge?: React.ReactNode;
  /** Text link on the right ("Details", "History"), drawn in Sparky Blue with a chevron. */
  actionLabel?: string;
  onPressAction?: () => void;
  /** Replaces the text link, for a card whose header carries a button. */
  right?: React.ReactNode;
  actionTestID?: string;
}

/**
 * The header row of the Dashboard's tabbed cards: an accent glyph, the card title in
 * Title Case, an optional quiet badge, and one action on the right.
 */
const DashboardCardHeader: React.FC<DashboardCardHeaderProps> = ({
  icon,
  title,
  badge,
  actionLabel,
  onPressAction,
  right,
  actionTestID,
}) => {
  const accent = useCSSVariable('--color-accent-primary') as string;
  return (
    <View className="flex-row items-center mb-3 gap-2">
      <Icon name={icon} size={18} color={accent} />
      <Text
        className="text-base font-bold text-text-primary flex-shrink"
        numberOfLines={1}
      >
        {title}
      </Text>
      {badge}
      <View className="flex-1" />
      {right ??
        (actionLabel && onPressAction ? (
          <Pressable
            testID={actionTestID}
            onPress={onPressAction}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="flex-row items-center"
          >
            <Text className="text-accent-primary font-medium text-sm">
              {actionLabel}
            </Text>
            <Icon name="chevron-forward" size={14} color={accent} />
          </Pressable>
        ) : null)}
    </View>
  );
};

export default DashboardCardHeader;
