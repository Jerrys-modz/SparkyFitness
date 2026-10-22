import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  convertEnergyValue,
  getGoalModeDailyAdjustment,
  parseWeeklyGoalRate,
} from '@workspace/shared';

import BottomSheetPicker from './BottomSheetPicker';
import FormInput from './FormInput';
import { useAppLocale } from '../localization';

type Direction = 'maintain' | 'lose' | 'gain';
type RateUnit = 'kg' | 'g';

interface WeeklyWeightGoalFieldsProps {
  weeklyChangeKg: number;
  energyUnit: 'kcal' | 'kJ';
  onChange: (weeklyChangeKg: number) => void;
}

const directionOf = (value: number): Direction =>
  value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain';

export default function WeeklyWeightGoalFields({
  weeklyChangeKg,
  energyUnit,
  onChange,
}: WeeklyWeightGoalFieldsProps) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const formatRate = (kg: number, unit: RateUnit) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: unit === 'g' ? 0 : 3,
      useGrouping: false,
    }).format(Math.abs(kg) * (unit === 'g' ? 1000 : 1));

  const [direction, setDirection] = useState<Direction>(() =>
    directionOf(weeklyChangeKg)
  );
  const [unit, setUnit] = useState<RateUnit>('kg');
  const [amount, setAmount] = useState(() =>
    weeklyChangeKg === 0 ? '' : formatRate(weeklyChangeKg, 'kg')
  );
  const [invalid, setInvalid] = useState(false);
  const [syncedChange, setSyncedChange] = useState(weeklyChangeKg);
  if (syncedChange !== weeklyChangeKg) {
    setSyncedChange(weeklyChangeKg);
    setDirection(directionOf(weeklyChangeKg));
    setAmount(weeklyChangeKg === 0 ? '' : formatRate(weeklyChangeKg, unit));
    setInvalid(false);
  }

  const parsedKg = parseWeeklyGoalRate(amount, unit);
  const draftChangeKg =
    direction === 'maintain'
      ? 0
      : parsedKg === null
        ? null
        : parsedKg * (direction === 'lose' ? -1 : 1);

  const saveRate = (nextDirection: Direction) => {
    if (nextDirection === 'maintain') {
      setInvalid(false);
      if (weeklyChangeKg !== 0) onChange(0);
      return;
    }
    const kg = parseWeeklyGoalRate(amount, unit);
    if (kg === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setAmount(formatRate(kg, unit));
    const signed = kg * (nextDirection === 'lose' ? -1 : 1);
    if (signed !== weeklyChangeKg) onChange(signed);
  };

  const handleDirectionChange = (value: string) => {
    const nextDirection = value as Direction;
    setDirection(nextDirection);
    // Choosing a direction from maintenance does not invent a rate.
    if (nextDirection !== 'maintain' && amount.trim() === '') return;
    saveRate(nextDirection);
  };

  const handleUnitChange = (value: string) => {
    const nextUnit = value as RateUnit;
    if (nextUnit === unit) return;
    if (amount.trim() !== '') {
      const kg = parseWeeklyGoalRate(amount, unit);
      if (kg === null) {
        setInvalid(true);
        return;
      }
      setAmount(formatRate(kg, nextUnit));
    }
    setUnit(nextUnit);
    setInvalid(false);
  };

  const dailyAdjustment =
    draftChangeKg === null
      ? null
      : Math.round(
          convertEnergyValue(
            getGoalModeDailyAdjustment('weekly', 0, 0, draftChangeKg),
            'kcal',
            energyUnit
          )
        );

  return (
    <View className="mt-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text-primary">
          {t('calorieSettings.weeklyGoal.direction', {
            defaultValue: 'Weight goal',
          })}
        </Text>
        <BottomSheetPicker
          value={direction}
          options={[
            {
              value: 'maintain',
              label: t('calorieSettings.weeklyGoal.maintain', {
                defaultValue: 'Keep weight stable',
              }),
            },
            {
              value: 'lose',
              label: t('calorieSettings.weeklyGoal.lose', {
                defaultValue: 'Lose weight',
              }),
            },
            {
              value: 'gain',
              label: t('calorieSettings.weeklyGoal.gain', {
                defaultValue: 'Gain weight',
              }),
            },
          ]}
          onSelect={handleDirectionChange}
          title={t('calorieSettings.weeklyGoal.direction', {
            defaultValue: 'Weight goal',
          })}
          containerStyle={{ flex: 1, maxWidth: 210, marginLeft: 16 }}
        />
      </View>
      {direction !== 'maintain' && (
        <>
          <Text className="text-sm font-semibold text-text-primary">
            {t('calorieSettings.weeklyGoal.rate', {
              defaultValue: 'Weight change per week',
            })}
          </Text>
          <View className="flex-row items-center gap-3">
            <FormInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setInvalid(false);
              }}
              onBlur={() => saveRate(direction)}
              keyboardType="decimal-pad"
              returnKeyType="done"
              maxLength={12}
              className="flex-1"
              accessibilityLabel={t('calorieSettings.weeklyGoal.amount', {
                defaultValue: 'Weekly weight change amount',
              })}
              accessibilityHint={t('calorieSettings.weeklyGoal.amountHint', {
                defaultValue:
                  'Enter a positive amount. The selected weight goal sets the direction.',
              })}
            />
            <BottomSheetPicker
              value={unit}
              options={[
                {
                  value: 'kg',
                  label: t('calorieSettings.weeklyGoal.kilograms', {
                    defaultValue: 'kg',
                  }),
                },
                {
                  value: 'g',
                  label: t('calorieSettings.weeklyGoal.grams', {
                    defaultValue: 'g',
                  }),
                },
              ]}
              onSelect={handleUnitChange}
              title={t('calorieSettings.weeklyGoal.unit', {
                defaultValue: 'Weekly rate unit',
              })}
              containerStyle={{ width: 90 }}
            />
          </View>
          {invalid && (
            <Text
              className="text-text-danger-subtle text-sm"
              accessibilityRole="alert"
            >
              {t('calorieSettings.weeklyGoal.invalidRate', {
                defaultValue:
                  'Enter a rate above 0 and up to {{max}} kg per week.',
                max: new Intl.NumberFormat(locale).format(
                  MAX_GOAL_MODE_WEEKLY_CHANGE_KG
                ),
              })}
            </Text>
          )}
        </>
      )}
      {dailyAdjustment !== null && (
        <Text className="text-sm font-semibold text-text-primary">
          {t('calorieSettings.weeklyGoal.dailyAdjustment', {
            defaultValue:
              'Estimated daily adjustment: {{sign}}{{amount}} {{unit}}',
            sign: dailyAdjustment > 0 ? '+' : dailyAdjustment < 0 ? '−' : '',
            amount: new Intl.NumberFormat(locale).format(
              Math.abs(dailyAdjustment)
            ),
            unit: energyUnit,
          })}
        </Text>
      )}
      <Text className="text-text-secondary text-sm">
        {t('calorieSettings.weeklyGoal.estimateHint', {
          defaultValue:
            'Your weekly goal is converted to a daily calorie adjustment. This is an estimate; your configured safety floor may limit weight loss.',
        })}
      </Text>
    </View>
  );
}
