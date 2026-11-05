import React from 'react';
import { Text, View } from 'react-native';

export type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<StatusBadgeTone, { wash: string; ink: string }> = {
  neutral: { wash: 'bg-raised', ink: 'text-text-secondary' },
  success: { wash: 'bg-bg-success', ink: 'text-text-success' },
  warning: { wash: 'bg-bg-warning', ink: 'text-text-warning' },
  danger: { wash: 'bg-bg-danger-subtle', ink: 'text-text-danger-subtle' },
};

interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  testID?: string;
}

/**
 * A quiet status pill: muted ink on a soft wash, no border. It states something and is
 * never tappable, so it must not look like a button.
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = 'neutral',
  testID,
}) => {
  const { wash, ink } = TONE_CLASSES[tone];
  return (
    <View testID={testID} className={`rounded-full px-2 py-0.5 ${wash}`}>
      <Text className={`text-xs font-medium ${ink}`} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

export default StatusBadge;
