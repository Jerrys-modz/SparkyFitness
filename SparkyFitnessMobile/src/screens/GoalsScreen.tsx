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
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import type { DailyGoals } from '../types/goals';
import type { RootStackScreenProps } from '../types/navigation';
import { getTodayDate } from '../utils/dateUtils';

type GoalsScreenProps = RootStackScreenProps<'Goals'>;

type NutrientGoalField =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'dietary_fiber'
  | 'saturated_fat'
  | 'polyunsaturated_fat'
  | 'monounsaturated_fat'
  | 'trans_fat'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'sugars'
  | 'vitamin_a'
  | 'vitamin_c'
  | 'calcium'
  | 'iron'
  | 'caffeine_mg'
  | 'alcohol_g';

type OtherGoalField =
  | 'water_goal_ml'
  | 'target_exercise_calories_burned'
  | 'target_exercise_duration_minutes';

type MealGoalField =
  | 'breakfast_percentage'
  | 'lunch_percentage'
  | 'dinner_percentage'
  | 'snacks_percentage';

type GoalField = NutrientGoalField | OtherGoalField | MealGoalField;

const MACRO_FIELDS: NutrientGoalField[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];

const OTHER_NUTRIENT_FIELDS: NutrientGoalField[] = [
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
  'alcohol_g',
];

const OTHER_FIELDS: OtherGoalField[] = [
  'water_goal_ml',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
];

const MEAL_FIELDS: MealGoalField[] = [
  'breakfast_percentage',
  'lunch_percentage',
  'dinner_percentage',
  'snacks_percentage',
];

const ALL_FIELDS: GoalField[] = [
  ...MACRO_FIELDS,
  ...OTHER_NUTRIENT_FIELDS,
  ...OTHER_FIELDS,
  ...MEAL_FIELDS,
];

const toDrafts = (goals: DailyGoals): Record<GoalField, string> =>
  Object.fromEntries(
    ALL_FIELDS.map((field) => [field, String(goals[field] ?? 0)])
  ) as Record<GoalField, string>;

const parseDraft = (text: string): number => Number(text.replace(',', '.'));

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
  const [initialDrafts] = useState(() => toDrafts(goals));
  const [drafts, setDrafts] = useState(initialDrafts);

  // Custom meal types carry their own percentages that must share the 100%
  // budget, so the four built-in meals are only editable on their own.
  const hasCustomMeals =
    Object.keys(goals.custom_meal_percentages ?? {}).length > 0;
  const mealTotal = MEAL_FIELDS.reduce(
    (sum, field) => sum + (parseDraft(drafts[field]) || 0),
    0
  );
  const mealTotalValid = hasCustomMeals || Math.round(mealTotal) === 100;

  const nutrientLabel = (field: NutrientGoalField) => {
    const unit = NUTRIENT_META[field]?.unit;
    const label = getNutrientLabel(t, field);
    return unit ? `${label} (${unit})` : label;
  };

  const labels: Record<GoalField, string> = {
    ...(Object.fromEntries(
      [...MACRO_FIELDS, ...OTHER_NUTRIENT_FIELDS].map((field) => [
        field,
        nutrientLabel(field),
      ])
    ) as Record<NutrientGoalField, string>),
    calories: isAdaptive
      ? t('goals.fields.baselineCalories', {
          defaultValue: 'Baseline calories (kcal)',
        })
      : nutrientLabel('calories'),
    water_goal_ml: t('goals.fields.water', { defaultValue: 'Water (ml)' }),
    target_exercise_calories_burned: t('goals.fields.exerciseCalories', {
      defaultValue: 'Exercise calories (kcal)',
    }),
    target_exercise_duration_minutes: t('goals.fields.exerciseMinutes', {
      defaultValue: 'Exercise duration (min)',
    }),
    breakfast_percentage: t('goals.meals.breakfast', {
      defaultValue: 'Breakfast (%)',
    }),
    lunch_percentage: t('goals.meals.lunch', { defaultValue: 'Lunch (%)' }),
    dinner_percentage: t('goals.meals.dinner', { defaultValue: 'Dinner (%)' }),
    snacks_percentage: t('goals.meals.snacks', { defaultValue: 'Snacks (%)' }),
  };

  const handleSave = useCallback(async () => {
    const next: DailyGoals = { ...goals };
    for (const field of ALL_FIELDS) {
      // Leave untouched fields exactly as the server returned them, so an
      // unset goal (null/absent) is not saved back as 0.
      if (drafts[field] === initialDrafts[field]) continue;
      const value = parseDraft(drafts[field]);
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
    if (!mealTotalValid) {
      Toast.show({
        type: 'error',
        text1: t('goals.meals.mustBe100', {
          defaultValue: 'Meal percentages must total 100%.',
        }),
      });
      return;
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
  }, [
    date,
    goals,
    drafts,
    initialDrafts,
    mealTotalValid,
    saveGoals,
    onDone,
    t,
  ]);

  const renderFields = (fields: GoalField[]) =>
    fields.map((field) => (
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
    ));

  const sectionTitle = (text: string) => (
    <Text className="text-base font-semibold text-text-primary pt-2">
      {text}
    </Text>
  );

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
      {sectionTitle(
        t('goals.sections.macros', { defaultValue: 'Calories & macros' })
      )}
      {renderFields(MACRO_FIELDS)}
      {sectionTitle(
        t('goals.sections.nutrients', { defaultValue: 'Other nutrients' })
      )}
      {renderFields(OTHER_NUTRIENT_FIELDS)}
      {sectionTitle(
        t('goals.sections.activity', { defaultValue: 'Water & exercise' })
      )}
      {renderFields(OTHER_FIELDS)}
      {sectionTitle(
        t('goals.sections.meals', { defaultValue: 'Meal calorie distribution' })
      )}
      {hasCustomMeals ? (
        <Text className="text-sm text-text-secondary">
          {t('goals.meals.customNote', {
            defaultValue:
              'You have custom meal types. Edit the meal distribution on the web.',
          })}
        </Text>
      ) : (
        <>
          {renderFields(MEAL_FIELDS)}
          <Text
            className={
              mealTotalValid
                ? 'text-sm text-text-secondary'
                : 'text-sm text-red-500'
            }
          >
            {t('goals.meals.total', {
              defaultValue: 'Total: {{total}}% (must be 100% to save)',
              total: Math.round(mealTotal),
            })}
          </Text>
        </>
      )}
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
