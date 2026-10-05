import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import StatusView from '../components/StatusView';
import { useServerConnection, usePreferences } from '../hooks';
import {
  useAdjustedCalorieGoal,
  useGoalsQuery,
  useSaveGoalsMutation,
} from '../hooks/useGoals';
import type { DailyGoals } from '../types/goals';
import type { RootStackScreenProps } from '../types/navigation';
import { getTodayDate } from '../utils/dateUtils';

type GoalsScreenProps = RootStackScreenProps<'Goals'>;

type GoalField =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'dietary_fiber'
  | 'water_goal_ml'
  | 'target_exercise_calories_burned'
  | 'target_exercise_duration_minutes';

const GOAL_FIELDS: GoalField[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'water_goal_ml',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
];

const toDrafts = (goals: DailyGoals): Record<GoalField, string> =>
  Object.fromEntries(
    GOAL_FIELDS.map((field) => [field, String(goals[field] ?? 0)])
  ) as Record<GoalField, string>;

interface GoalsFormProps {
  date: string;
  goals: DailyGoals;
  onDone: () => void;
}

const GoalsForm: React.FC<GoalsFormProps> = ({ date, goals, onDone }) => {
  const { t } = useTranslation();
  const { saveGoals, isPending } = useSaveGoalsMutation();
  const { preferences } = usePreferences();
  const isAdaptive = preferences?.calorie_goal_adjustment_mode === 'adaptive';
  const adjustedCalories = useAdjustedCalorieGoal(date, isAdaptive);
  const [drafts, setDrafts] = useState(() => toDrafts(goals));

  const labels: Record<GoalField, string> = {
    calories: isAdaptive
      ? t('goals.fields.baselineCalories', {
          defaultValue: 'Baseline calories (kcal)',
        })
      : t('goals.fields.calories', { defaultValue: 'Calories (kcal)' }),
    protein: t('goals.fields.protein', { defaultValue: 'Protein (g)' }),
    carbs: t('goals.fields.carbs', { defaultValue: 'Carbs (g)' }),
    fat: t('goals.fields.fat', { defaultValue: 'Fat (g)' }),
    dietary_fiber: t('goals.fields.fiber', { defaultValue: 'Fiber (g)' }),
    water_goal_ml: t('goals.fields.water', { defaultValue: 'Water (ml)' }),
    target_exercise_calories_burned: t('goals.fields.exerciseCalories', {
      defaultValue: 'Exercise calories (kcal)',
    }),
    target_exercise_duration_minutes: t('goals.fields.exerciseMinutes', {
      defaultValue: 'Exercise duration (min)',
    }),
  };

  const handleSave = useCallback(async () => {
    const next: DailyGoals = { ...goals };
    for (const field of GOAL_FIELDS) {
      const value = Number(drafts[field].replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        Toast.show({
          type: 'error',
          text1: t('goals.invalidValue', {
            defaultValue: 'Enter a valid number for every goal.',
          }),
        });
        return;
      }
      next[field] = value;
    }
    try {
      await saveGoals({ date, goals: next, cascade: true });
      onDone();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.saveFailed', { defaultValue: 'Failed to save goals.' }),
      });
    }
  }, [date, goals, drafts, saveGoals, onDone, t]);

  return (
    <FormScreenChrome
      title={t('goals.title', { defaultValue: 'Goals' })}
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending}
      onSave={handleSave}
      onCancel={onDone}
    >
      <Text className="text-sm text-text-secondary">
        {t('goals.description', {
          defaultValue:
            'Daily targets that apply from today onward. Past days keep their goals.',
        })}
      </Text>
      {isAdaptive && (
        <Text className="text-sm text-text-secondary">
          {adjustedCalories !== undefined
            ? t('goals.adaptiveNoteToday', {
                defaultValue:
                  'Adaptive mode is on, so your calorie goal changes daily. Today it is {{calories}} kcal. The baseline below sets how far above or below your estimated maintenance you aim to be; it is not a fixed daily target.',
                calories: Math.round(adjustedCalories),
              })
            : t('goals.adaptiveNote', {
                defaultValue:
                  'Adaptive mode is on, so your calorie goal changes daily. The baseline below sets how far above or below your estimated maintenance you aim to be; it is not a fixed daily target.',
              })}
        </Text>
      )}
      {GOAL_FIELDS.map((field) => (
        <View key={field} className="gap-1">
          <Text className="text-sm font-medium text-text-primary">
            {labels[field]}
          </Text>
          <FormInput
            value={drafts[field]}
            onChangeText={(text) =>
              setDrafts((prev) => ({ ...prev, [field]: text }))
            }
            keyboardType="decimal-pad"
            accessibilityLabel={labels[field]}
            testID={`goal-input-${field}`}
          />
        </View>
      ))}
    </FormScreenChrome>
  );
};

const GoalsScreen: React.FC<GoalsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const [date] = useState(getTodayDate);
  const { goals, isLoading, isError, refetch } = useGoalsQuery(date, {
    enabled: isConnected,
  });
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  if (isLoading || isError || !goals) {
    return (
      <StatusView
        loading={isLoading}
        icon={isLoading ? undefined : 'alert-circle'}
        title={
          isLoading
            ? undefined
            : t('goals.loadFailed', {
                defaultValue: 'Could not load your goals.',
              })
        }
        action={
          isLoading
            ? undefined
            : {
                label: t('common.retry', { defaultValue: 'Retry' }),
                onPress: () => void refetch(),
              }
        }
      />
    );
  }

  return <GoalsForm date={date} goals={goals} onDone={goBack} />;
};

export default GoalsScreen;
