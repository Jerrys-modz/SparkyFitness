import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatLabRange, formatLabValue } from '../../utils/labResults';

interface LabRangeBarProps {
  value: number;
  low: number;
  high: number;
  unit: string;
}

/** A single result placed on its reference range, shown instead of a one-point chart. */
const LabRangeBar: React.FC<LabRangeBarProps> = ({
  value,
  low,
  high,
  unit,
}) => {
  const { t } = useTranslation();
  const span = high - low || Math.abs(high) || 1;
  const min = Math.max(0, low - span * 0.5);
  const max = high + span * 0.5;
  const pct = (n: number) =>
    Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100));

  return (
    <View
      className="py-4 gap-2"
      accessible
      accessibilityLabel={t('labs.referenceRange', {
        defaultValue: 'Reference range: {{range}}',
        range: formatLabRange(low, high, unit),
      })}
    >
      <View className="h-3 rounded-full bg-border-subtle justify-center">
        <View
          className="absolute h-3 rounded-full bg-accent-primary opacity-30"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        <View
          className="absolute w-4 h-4 rounded-full bg-accent-primary border-2 border-surface"
          style={{ left: `${pct(value)}%`, marginLeft: -8 }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-text-muted text-xs">
          {formatLabValue(low, unit)}
        </Text>
        <Text className="text-text-muted text-xs">
          {formatLabValue(high, unit)}
        </Text>
      </View>
    </View>
  );
};

export default LabRangeBar;
