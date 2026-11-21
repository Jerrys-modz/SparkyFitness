import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';
import CalorieRingCard from './CalorieRingCard';
import ExerciseProgressCard from './ExerciseProgressCard';
import HydrationGauge from './HydrationGauge';
import MacroCard from './MacroCard';
import { usePreferences } from '../hooks';
import {
  buildDailySummary,
  rawFromDailySummaryResponse,
} from '../services/dailySummaryService';
import type { DailySummaryApiResponse } from '../services/api/dailySummaryApi';

interface FamilyDashboardSummaryProps {
  data: DailySummaryApiResponse;
  date: string;
}

/**
 * Read-only dashboard for a family member's day: the same cards as the own
 * Dashboard, minus every control that would write to their data.
 */
const FamilyDashboardSummary: React.FC<FamilyDashboardSummaryProps> = ({
  data,
  date,
}) => {
  const { t } = useTranslation();
  const summary = useMemo(
    () => buildDailySummary(date, rawFromDailySummaryResponse(data)),
    [data, date]
  );
  const { preferences } = usePreferences({ enabled: true });
  const [proteinColor, carbsColor, fatColor, fiberColor, overfillColor] =
    useCSSVariable([
      '--color-macro-protein',
      '--color-macro-carbs',
      '--color-macro-fat',
      '--color-macro-fiber',
      '--color-progress-overfill',
    ]) as [string, string, string, string, string];

  const { eaten, burned, remaining, progress } = summary.calorieBalance;
  const macros = [
    {
      key: 'protein',
      label: t('nutrients.protein', { defaultValue: 'Protein' }),
      color: proteinColor,
      value: summary.protein,
    },
    {
      key: 'carbs',
      label: t('nutrients.carbs', { defaultValue: 'Carbs' }),
      color: carbsColor,
      value: summary.carbs,
    },
    {
      key: 'fat',
      label: t('nutrients.fat', { defaultValue: 'Fat' }),
      color: fatColor,
      value: summary.fat,
    },
    {
      key: 'fiber',
      label: t('nutrients.fiber', { defaultValue: 'Fiber' }),
      color: fiberColor,
      value: summary.fiber,
    },
  ];
  const showExercise =
    summary.exerciseMinutesGoal > 0 ||
    summary.exerciseCaloriesGoal > 0 ||
    summary.exerciseMinutes > 0 ||
    summary.otherExerciseCalories > 0;

  return (
    <View testID="family-dashboard-summary">
      <CalorieRingCard
        caloriesConsumed={eaten}
        caloriesBurned={burned}
        calorieGoal={eaten + remaining}
        remainingCalories={remaining}
        progressPercent={(progress || 0) / 100 || 0}
      />
      <View className="flex-row flex-wrap justify-between">
        {macros.map(({ key, label, color, value }) => (
          <MacroCard
            key={key}
            label={label}
            consumed={value.consumed}
            goal={value.goal || undefined}
            color={color}
            overfillColor={overfillColor}
            unit="g"
          />
        ))}
      </View>
      {showExercise ? (
        <ExerciseProgressCard
          exerciseMinutes={summary.exerciseMinutes}
          exerciseMinutesGoal={summary.exerciseMinutesGoal}
          exerciseCalories={summary.otherExerciseCalories}
          exerciseCaloriesGoal={summary.exerciseCaloriesGoal}
        />
      ) : null}
      <HydrationGauge
        consumed={summary.waterConsumed}
        goal={summary.waterGoal}
        fromFoodMl={summary.waterFromFood}
        unit={preferences?.water_display_unit || 'ml'}
      />
    </View>
  );
};

export default FamilyDashboardSummary;
