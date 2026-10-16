import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { ComponentWearState } from '@workspace/shared';

const BAR_COLOR: Record<ComponentWearState, string> = {
  ok: 'bg-accent-primary',
  due_soon: 'bg-amber-500',
  due_now: 'bg-red-500',
};

const TEXT_COLOR: Record<ComponentWearState, string> = {
  ok: 'text-text-secondary',
  due_soon: 'text-amber-500',
  due_now: 'text-red-500',
};

interface ComponentWearBarProps {
  wearPercent: number;
  state: ComponentWearState;
}

/** Wear as a bar capped at 100% with the true percentage and state beside it. */
const ComponentWearBar: React.FC<ComponentWearBarProps> = ({
  wearPercent,
  state,
}) => {
  const { t } = useTranslation();
  const label =
    state === 'due_now'
      ? t('bikes.dueNow', { defaultValue: 'Due now' })
      : state === 'due_soon'
        ? t('bikes.dueSoon', { defaultValue: 'Due soon' })
        : null;
  return (
    <View>
      <View className="flex-row justify-between mb-1">
        <Text className="text-sm font-medium text-text-primary">
          {t('bikes.wearPercent', {
            defaultValue: '{{percent}}% worn',
            percent: Math.round(wearPercent),
          })}
        </Text>
        {label ? (
          <Text className={`text-xs font-semibold ${TEXT_COLOR[state]}`}>
            {label}
          </Text>
        ) : null}
      </View>
      <View className="h-2 rounded-full bg-border overflow-hidden">
        <View
          className={`h-2 rounded-full ${BAR_COLOR[state]}`}
          style={{ width: `${Math.min(100, Math.max(0, wearPercent))}%` }}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(wearPercent),
          }}
        />
      </View>
    </View>
  );
};

export default ComponentWearBar;
