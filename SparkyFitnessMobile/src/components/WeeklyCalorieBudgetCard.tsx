import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { WeeklyCalorieBudgetDay } from '@workspace/shared';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';

interface WeeklyCalorieBudgetCardProps {
  budget: WeeklyCalorieBudgetDay;
  /** Calories logged on the shown day so far, kcal. */
  eatenToday: number;
}

/**
 * Used / remaining / the day's adjusted target for the weekly calorie budget,
 * all from the server's `weeklyCalorieBudget`; nothing is recomputed here.
 */
export default function WeeklyCalorieBudgetCard({
  budget,
  eatenToday,
}: WeeklyCalorieBudgetCardProps) {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const unit = energyUnitLabel(energyUnit, t);
  const show = (kcal: number) => formatEnergyNumber(kcal, energyUnit);

  const used = budget.eatenSoFar + Math.max(0, eatenToday);
  const remaining = budget.weekBudget - used;

  let reason: string;
  if (budget.countedDays === 0) {
    reason = t('weeklyBudget.reasonNoDays', {
      defaultValue:
        'No finished days counted yet this week, so today keeps its own target.',
    });
  } else if (budget.shift === 0 && budget.carryover === 0) {
    reason = t('weeklyBudget.reasonOnTrack', {
      defaultValue:
        'You are on track for the week, so today keeps its own target.',
    });
  } else if (budget.carryover > 0) {
    reason = t('weeklyBudget.reasonUnder', {
      defaultValue:
        '{{amount}} {{unit}} under so far, spread over {{days}} days left: +{{shift}} {{unit}} today.',
      amount: show(budget.carryover),
      days: budget.daysLeft,
      shift: show(Math.abs(budget.shift)),
      unit,
    });
  } else {
    reason = t('weeklyBudget.reasonOver', {
      defaultValue:
        '{{amount}} {{unit}} over so far, spread over {{days}} days left: −{{shift}} {{unit}} today.',
      amount: show(-budget.carryover),
      days: budget.daysLeft,
      shift: show(Math.abs(budget.shift)),
      unit,
    });
  }
  const limit =
    budget.limitedBy === 'cap'
      ? t('weeklyBudget.limitedByCap', {
          defaultValue: 'Limited to ±{{percent}}% of your daily target.',
          percent: budget.maxShiftPercent,
        })
      : budget.limitedBy === 'floor'
        ? t('weeklyBudget.limitedByFloor', {
            defaultValue: 'Held at your safety floor.',
          })
        : null;

  const stat = (value: string, label: string, testID: string) => (
    <View className="flex-1 items-center">
      <Text className="text-lg font-bold text-text-primary" testID={testID}>
        {value}
      </Text>
      <Text className="text-xs text-text-secondary text-center">{label}</Text>
    </View>
  );

  return (
    <View
      className="bg-surface rounded-lg px-4 py-3 mb-3 shadow-sm"
      testID="weekly-calorie-budget-card"
    >
      <Text className="text-md font-bold text-text-secondary mb-2">
        {t('weeklyBudget.title', { defaultValue: 'Weekly budget' })}
      </Text>
      <View className="flex-row">
        {stat(
          show(used),
          t('weeklyBudget.used', {
            defaultValue: 'Used of {{total}}',
            total: show(budget.weekBudget),
          }),
          'weekly-budget-used'
        )}
        {stat(
          show(remaining),
          t('weeklyBudget.remaining', { defaultValue: 'Remaining' }),
          'weekly-budget-remaining'
        )}
        {stat(
          show(budget.target),
          t('weeklyBudget.todayTarget', { defaultValue: "Today's target" }),
          'weekly-budget-target'
        )}
      </View>
      <Text
        className="text-xs text-text-secondary mt-2"
        testID="weekly-budget-reason"
      >
        {limit ? `${reason} ${limit}` : reason}
      </Text>
    </View>
  );
}
