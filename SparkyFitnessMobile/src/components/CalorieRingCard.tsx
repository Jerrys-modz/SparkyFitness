import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, useWindowDimensions } from 'react-native';
import { useCSSVariable } from 'uniwind';
import ProgressRing from './ProgressRing';
import { formatLocalizedNumber } from '../localization';
import { energyFromKcal } from '@workspace/shared';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';

interface SideStatProps {
  label: string;
  value: number;
}

// Above this system font scale the side stats no longer fit beside the ring,
// so they move into a row under it.
const STACK_FONT_SCALE = 1.3;

const SideStat: React.FC<SideStatProps> = ({ label, value }) => (
  <View className="items-center justify-center flex-1">
    <Text
      className="text-xl font-bold text-text-primary"
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {formatLocalizedNumber(Math.round(value))}
    </Text>
    <Text className="text-text-secondary text-xs mt-1" numberOfLines={1}>
      {label}
    </Text>
  </View>
);

interface CalorieRingCardProps {
  caloriesConsumed: number;
  caloriesBurned: number;
  calorieGoal: number;
  remainingCalories: number;
  progressPercent: number;
}

const CalorieRingCard: React.FC<CalorieRingCardProps> = ({
  caloriesConsumed,
  caloriesBurned,
  calorieGoal,
  remainingCalories,
  progressPercent,
}) => {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_FONT_SCALE;
  const energyUnit = useEnergyUnit();
  const [progressTrackColor, progressFillColor] = useCSSVariable([
    '--color-progress-track',
    '--color-calories',
  ]) as [string, string];

  const displayRemaining =
    Math.round(energyFromKcal(remainingCalories, energyUnit)) || 0;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View
        className={
          stacked
            ? 'items-center justify-center'
            : 'flex-row items-center justify-center'
        }
      >
        {stacked ? null : (
          <SideStat
            label={t('dashboard.consumed', { defaultValue: 'Consumed' })}
            value={energyFromKcal(caloriesConsumed, energyUnit)}
          />
        )}

        <View className="relative items-center justify-center mx-2">
          <View>
            <ProgressRing
              progress={progressPercent}
              size={160}
              strokeWidth={12}
              color={progressFillColor}
              backgroundColor={progressTrackColor}
            />
          </View>
          <View className="absolute items-center justify-center">
            <Text
              className="text-2xl font-bold text-text-primary"
              maxFontSizeMultiplier={1.3}
            >
              {formatLocalizedNumber(displayRemaining)}
            </Text>
            <Text
              className="text-text-secondary text-xs"
              maxFontSizeMultiplier={1.3}
            >
              {t('dashboard.remaining', { defaultValue: 'remaining' })}
            </Text>
            <Text
              className="text-text-muted text-xs mt-0.5"
              maxFontSizeMultiplier={1.3}
            >
              {t('dashboard.ofCaloriesWithUnit', {
                defaultValue: 'of {{value}} {{unit}}',
                value: formatEnergyNumber(calorieGoal, energyUnit),
                unit: energyUnitLabel(energyUnit, t),
              })}
            </Text>
          </View>
        </View>

        {stacked ? (
          <View className="flex-row w-full mt-3">
            <SideStat
              label={t('dashboard.consumed', { defaultValue: 'Consumed' })}
              value={energyFromKcal(caloriesConsumed, energyUnit)}
            />
            <SideStat
              label={t('dashboard.burned', { defaultValue: 'Burned' })}
              value={energyFromKcal(caloriesBurned, energyUnit)}
            />
          </View>
        ) : (
          <SideStat
            label={t('dashboard.burned', { defaultValue: 'Burned' })}
            value={energyFromKcal(caloriesBurned, energyUnit)}
          />
        )}
      </View>
    </View>
  );
};

export default CalorieRingCard;
