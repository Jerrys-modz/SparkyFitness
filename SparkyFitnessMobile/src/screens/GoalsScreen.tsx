import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useProfile, useServerConnection, usePreferences } from '../hooks';
import { useLatestMeasurementsOnOrBefore } from '../hooks/useMeasurements';
import {
  useAdjustedCalorieGoal,
  useGoalsQuery,
  useNutrientGoalPreferences,
  useSaveGoalsMutation,
  useSaveNutrientGoalPreferences,
} from '../hooks/useGoals';
import type {
  NutrientGoalPreferences,
  NutrientGoalType,
} from '../services/api/nutrientGoalPreferencesApi';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import {
  AddedSugarAlgorithm,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  calculateAge,
  calculateSingleNutrientAutoValue,
  getAutoCalculateFamily,
  type AlgorithmBundle,
  type UserNutrientData,
} from '@workspace/shared';
import type { DailyGoals } from '../types/goals';
import type { RootStackScreenProps } from '../types/navigation';
import { getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import {
  WATER_UNIT_LABELS,
  volumeFromMl,
  volumeToMl,
} from '../utils/unitConversions';

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

const toDrafts = (
  goals: DailyGoals,
  waterUnit: string
): Record<GoalField, string> => {
  const drafts = Object.fromEntries(
    ALL_FIELDS.map((field) => [field, String(goals[field] ?? 0)])
  ) as Record<GoalField, string>;
  // Water is stored in ml; the field is edited in the user's water unit.
  drafts.water_goal_ml = String(
    Number(volumeFromMl(goals.water_goal_ml ?? 0, waterUnit).toFixed(2))
  );
  return drafts;
};

const parseDraft = (text: string): number => Number(text.replace(',', '.'));

const ACTIVITY_LEVELS = ['not_much', 'light', 'moderate', 'heavy'] as const;

const enumValue = <T extends string>(
  values: Record<string, T>,
  raw: string | undefined,
  fallback: T
): T => (Object.values(values).includes(raw as T) ? (raw as T) : fallback);

interface DirectionDraft {
  goalType: NutrientGoalType;
  min: string;
  max: string;
}

const NUTRIENT_DIRECTION_FIELDS: NutrientGoalField[] = [
  ...MACRO_FIELDS,
  ...OTHER_NUTRIENT_FIELDS,
];

const toDirectionDrafts = (
  directions: NutrientGoalPreferences
): Record<string, DirectionDraft> =>
  Object.fromEntries(
    NUTRIENT_DIRECTION_FIELDS.filter((field) => directions[field]).map(
      (field) => [
        field,
        {
          goalType: directions[field].goalType,
          min: String(directions[field].targetMin ?? ''),
          max: String(directions[field].targetMax ?? ''),
        },
      ]
    )
  );

interface GoalsFormProps {
  date: string;
  goals: DailyGoals;
  directions?: NutrientGoalPreferences;
  onDone: () => void;
}

const GoalsForm: React.FC<GoalsFormProps> = ({
  date,
  goals,
  directions,
  onDone,
}) => {
  const { t } = useTranslation();
  const { saveGoals, isPending: isSavingGoals } = useSaveGoalsMutation();
  const saveDirections = useSaveNutrientGoalPreferences();
  const [isSavingDirections, setIsSavingDirections] = useState(false);
  const isPending = isSavingGoals || isSavingDirections;
  const [initialDirections] = useState(() =>
    directions ? toDirectionDrafts(directions) : {}
  );
  const [directionDrafts, setDirectionDrafts] = useState(initialDirections);
  const { preferences } = usePreferences();
  const isAdaptive = preferences?.calorie_goal_adjustment_mode === 'adaptive';
  const adjustedCalories = useAdjustedCalorieGoal(date, isAdaptive);
  const waterUnit = preferences?.water_display_unit ?? 'ml';
  const { profile } = useProfile();
  const { latestMeasurements } = useLatestMeasurementsOnOrBefore({ date });
  const [initialDrafts] = useState(() => toDrafts(goals, waterUnit));
  const [drafts, setDrafts] = useState(initialDrafts);

  const algorithms: AlgorithmBundle = useMemo(
    () => ({
      fatBreakdown: enumValue(
        FatBreakdownAlgorithm,
        preferences?.fat_breakdown_algorithm,
        FatBreakdownAlgorithm.AHA_GUIDELINES
      ),
      minerals: enumValue(
        MineralCalculationAlgorithm,
        preferences?.mineral_calculation_algorithm,
        MineralCalculationAlgorithm.RDA_STANDARD
      ),
      vitamins: enumValue(
        VitaminCalculationAlgorithm,
        preferences?.vitamin_calculation_algorithm,
        VitaminCalculationAlgorithm.RDA_STANDARD
      ),
      sugar: enumValue(
        SugarCalculationAlgorithm,
        preferences?.sugar_calculation_algorithm,
        SugarCalculationAlgorithm.WHO_GUIDELINES
      ),
      addedSugar: AddedSugarAlgorithm.WHO_MAXIMUM,
    }),
    [preferences]
  );

  // Several formulas depend on sex, so with it unknown the calculator is
  // withheld rather than guessing a silently wrong recommendation.
  const calcCalories = parseDraft(drafts.calories);
  const calcFat = parseDraft(drafts.fat);
  const userData: UserNutrientData | null = useMemo(() => {
    if (profile?.gender !== 'male' && profile?.gender !== 'female') return null;
    const activity = ACTIVITY_LEVELS.find(
      (level) => level === preferences?.activity_level
    );
    return {
      age: profile.date_of_birth
        ? calculateAge(profile.date_of_birth, getDeviceTimezone())
        : 0,
      sex: profile.gender,
      weightKg: Number(latestMeasurements?.weight) || 0,
      calories: Number.isFinite(calcCalories) ? calcCalories : 0,
      totalFatGrams: Number.isFinite(calcFat) ? calcFat : 0,
      activityLevel: activity,
    };
  }, [profile, latestMeasurements, preferences, calcCalories, calcFat]);

  const calculateField = (field: NutrientGoalField): number | null => {
    if (!userData) return null;
    const value = calculateSingleNutrientAutoValue(field, userData, algorithms);
    return value === null ? null : Math.round(value * 10) / 10;
  };

  const applyCalculated = (fields: NutrientGoalField[]) => {
    const updates: Partial<Record<GoalField, string>> = {};
    for (const field of fields) {
      const value = calculateField(field);
      if (value !== null) updates[field] = String(value);
    }
    setDrafts((prev) => ({ ...prev, ...updates }));
  };

  const calculableFields = NUTRIENT_DIRECTION_FIELDS.filter(
    (field) => getAutoCalculateFamily(field) !== null
  );

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
    water_goal_ml: t('goals.fields.water', {
      defaultValue: 'Water ({{unit}})',
      unit: WATER_UNIT_LABELS[waterUnit] ?? waterUnit,
    }),
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
      next[field] =
        field === 'water_goal_ml'
          ? Math.round(volumeToMl(value, waterUnit))
          : value;
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
    const directionUpdates: {
      key: string;
      preference: {
        goalType: NutrientGoalType;
        targetMin?: number;
        targetMax?: number;
      };
    }[] = [];
    for (const [key, draft] of Object.entries(directionDrafts)) {
      const initial = initialDirections[key];
      if (
        initial &&
        initial.goalType === draft.goalType &&
        (draft.goalType !== 'target' ||
          (initial.min === draft.min && initial.max === draft.max))
      ) {
        continue;
      }
      if (draft.goalType === 'target') {
        const min = parseDraft(draft.min);
        const max = parseDraft(draft.max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
          Toast.show({
            type: 'error',
            text1: t('goals.directions.invalidRange', {
              defaultValue:
                'A range needs a minimum and a maximum, with minimum not above maximum.',
            }),
          });
          return;
        }
        directionUpdates.push({
          key,
          preference: { goalType: 'target', targetMin: min, targetMax: max },
        });
      } else {
        directionUpdates.push({
          key,
          preference: { goalType: draft.goalType },
        });
      }
    }
    try {
      await saveGoals({ date, goals: next, cascade: true });
      if (directionUpdates.length > 0) {
        setIsSavingDirections(true);
        try {
          await saveDirections(directionUpdates);
        } finally {
          setIsSavingDirections(false);
        }
      }
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
    waterUnit,
    directionDrafts,
    initialDirections,
    saveDirections,
    saveGoals,
    onDone,
    t,
  ]);

  const directionSegments: Segment<NutrientGoalType>[] = [
    {
      key: 'minimum',
      label: t('goals.directions.minimum', { defaultValue: 'Min' }),
    },
    {
      key: 'maximum',
      label: t('goals.directions.maximum', { defaultValue: 'Max' }),
    },
    {
      key: 'target',
      label: t('goals.directions.range', { defaultValue: 'Range' }),
    },
  ];

  const renderDirection = (field: NutrientGoalField) => {
    const draft = directionDrafts[field];
    const update = (patch: Partial<DirectionDraft>) =>
      setDirectionDrafts((prev) => ({
        ...prev,
        [field]: { ...prev[field], ...patch },
      }));
    return (
      <View className="gap-2 pt-1">
        <SegmentedControl
          segments={directionSegments}
          activeKey={draft.goalType}
          onSelect={(goalType) => update({ goalType })}
        />
        {draft.goalType === 'target' && (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <FormInput
                value={draft.min}
                onChangeText={(min) => update({ min })}
                keyboardType="decimal-pad"
                placeholder={t('goals.directions.rangeMin', {
                  defaultValue: 'Range min',
                })}
                accessibilityLabel={`${labels[field]} ${t(
                  'goals.directions.rangeMin',
                  { defaultValue: 'Range min' }
                )}`}
              />
            </View>
            <View className="flex-1">
              <FormInput
                value={draft.max}
                onChangeText={(max) => update({ max })}
                keyboardType="decimal-pad"
                placeholder={t('goals.directions.rangeMax', {
                  defaultValue: 'Range max',
                })}
                accessibilityLabel={`${labels[field]} ${t(
                  'goals.directions.rangeMax',
                  { defaultValue: 'Range max' }
                )}`}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderCalculate = (field: NutrientGoalField) => (
    <Button
      variant="secondary"
      onPress={() => applyCalculated([field])}
      accessibilityLabel={t('goals.calculator.calculateField', {
        defaultValue: 'Calculate {{nutrient}}',
        nutrient: getNutrientLabel(t, field),
      })}
      className="py-2 self-start"
      textClassName="text-xs"
    >
      {t('goals.calculator.calculate', { defaultValue: 'Calculate' })}
    </Button>
  );

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
        {userData &&
          getAutoCalculateFamily(field) !== null &&
          renderCalculate(field as NutrientGoalField)}
        {directionDrafts[field] && renderDirection(field as NutrientGoalField)}
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
      {Object.keys(directionDrafts).length > 0 && (
        <Text className="text-sm text-text-secondary">
          {t('goals.directions.note', {
            defaultValue:
              'Min means more is better, Max means stay under, and Range means stay between two values. This changes how progress is judged, not the goal numbers.',
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
      {userData ? (
        <Button
          variant="secondary"
          onPress={() => applyCalculated(calculableFields)}
          className="py-2"
          textClassName="text-sm"
        >
          {t('goals.calculator.calculateAll', {
            defaultValue: 'Calculate all from my profile',
          })}
        </Button>
      ) : (
        <Text className="text-sm text-text-secondary">
          {t('goals.calculator.needsProfile', {
            defaultValue:
              'Set your sex in your profile on the web to calculate recommended nutrient goals.',
          })}
        </Text>
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
  const { directions, isLoading: isLoadingDirections } =
    useNutrientGoalPreferences({ enabled: isConnected });
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  if (isLoading || isLoadingDirections || isError || !goals) {
    return (
      <StatusView
        loading={isLoading || isLoadingDirections}
        icon={isLoading || isLoadingDirections ? undefined : 'alert-circle'}
        title={
          isLoading || isLoadingDirections
            ? undefined
            : t('goals.loadFailed', {
                defaultValue: 'Could not load your goals.',
              })
        }
        action={
          isLoading || isLoadingDirections
            ? undefined
            : {
                label: t('common.retry', { defaultValue: 'Retry' }),
                onPress: () => void refetch(),
              }
        }
      />
    );
  }

  return (
    <GoalsForm
      date={date}
      goals={goals}
      directions={directions}
      onDone={goBack}
    />
  );
};

export default GoalsScreen;
