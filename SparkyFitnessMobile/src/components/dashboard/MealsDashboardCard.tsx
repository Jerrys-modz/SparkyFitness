import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { MEAL_CONFIG } from '../../constants/meals';
import { useMealTypes } from '../../hooks/useMealTypes';
import { formatLocalizedNumber } from '../../localization';
import type { FoodEntry } from '../../types/foodEntries';
import type { DailyGoals } from '../../types/goals';
import {
  buildDashboardMealRows,
  summarizeMealFoods,
} from '../../utils/dashboardMeals';
import {
  calculateMealNutrition,
  getMealGroupLabel,
  getMealTargetCalories,
  type MealGroup,
} from '../../utils/mealNutrition';
import Icon from '../Icon';
import DashboardCardHeader from './DashboardCardHeader';

interface MealsDashboardCardProps {
  foodEntries: FoodEntry[];
  goals?: DailyGoals;
  calorieGoal?: number;
  /** Opens food search, pre-set to a meal when one is given. */
  onAddFood: (mealTypeId?: string) => void;
  onOpenMeal: (group: MealGroup, label: string) => void;
}

/**
 * The day's meals on the Nutrition tab: each meal with what it held and its calories,
 * an empty meal with its calorie target and a "+ Add" link, and one Log Meal button.
 * A logged meal opens the same meal view as the Diary.
 */
const MealsDashboardCard: React.FC<MealsDashboardCardProps> = ({
  foodEntries,
  goals,
  calorieGoal,
  onAddFood,
  onOpenMeal,
}) => {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const { mealTypes } = useMealTypes();
  const rows = useMemo(
    () => buildDashboardMealRows(foodEntries, mealTypes),
    [foodEntries, mealTypes]
  );

  if (rows.length === 0) return null;

  return (
    <View
      testID="meals-dashboard-card"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="meal"
        title={t('dashboard.mealsCard.title', { defaultValue: 'Meals' })}
        right={
          <Pressable
            testID="meals-dashboard-card-log"
            onPress={() => onAddFood()}
            accessibilityRole="button"
            className="flex-row items-center bg-accent-primary rounded-lg px-3 py-1.5"
          >
            <Icon name="add" size={14} color="#FFFFFF" />
            <Text className="text-white text-sm font-semibold ml-1">
              {t('dashboard.mealsCard.logMeal', { defaultValue: 'Log Meal' })}
            </Text>
          </Pressable>
        }
      />
      <View className="gap-2">
        {rows.map((group) => {
          const label = getMealGroupLabel(group, t);
          const icon = group.isSystem
            ? (MEAL_CONFIG[group.name.toLowerCase()]?.icon ?? 'meal-snack')
            : 'meal-snack';
          const logged = group.entries.length > 0;
          const calories = Math.round(
            calculateMealNutrition(group.entries).values.calories
          );
          const target = getMealTargetCalories(
            group.name,
            group.isSystem,
            goals,
            calorieGoal
          );
          const { names, more } = summarizeMealFoods(group.entries);
          const key = group.mealTypeId ?? `name:${group.name}`;
          const subtitle = logged
            ? more > 0
              ? t('dashboard.mealsCard.foodsMore', {
                  defaultValue: '{{names}} +{{more}}',
                  names: names.join(', '),
                  more,
                })
              : names.join(', ')
            : target > 0
              ? t('dashboard.mealsCard.target', {
                  defaultValue: 'Target: ~{{calories}} Cal',
                  calories: formatLocalizedNumber(target),
                })
              : t('dashboard.mealsCard.nothingYet', {
                  defaultValue: 'Nothing logged yet',
                });

          return (
            <Pressable
              key={key}
              testID={`meals-dashboard-card-row-${key}`}
              onPress={() =>
                logged
                  ? onOpenMeal(group, label)
                  : onAddFood(group.mealTypeId ?? undefined)
              }
              accessibilityRole="button"
              className="flex-row items-center bg-raised rounded-lg px-3 py-2.5 gap-3"
            >
              <Icon name={icon} size={18} color={accent} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-primary">
                  {label}
                </Text>
                <Text className="text-xs text-text-muted" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
              {logged ? (
                <Text className="text-sm font-semibold text-text-primary">
                  {t('dashboard.mealsCard.calories', {
                    defaultValue: '{{calories}} Cal',
                    calories: formatLocalizedNumber(calories),
                  })}
                </Text>
              ) : (
                <Text className="text-sm font-medium text-accent-primary">
                  {t('dashboard.mealsCard.add', { defaultValue: '+ Add' })}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default MealsDashboardCard;
