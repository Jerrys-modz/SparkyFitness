import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  DIET_MACRO_SPLITS,
  DEFAULT_DIET_ID,
  ONBOARDING_BODY_FAT_RANGES,
  type OnboardingActivityLevel,
  type OnboardingPrimaryGoal,
} from '@workspace/shared';

import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import FooterActionBar from '../components/FooterActionBar';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import {
  goalSetupAccount,
  useSaveGoalSetup,
  useSkipGoalSetup,
} from '../hooks/useGoalSetup';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { usePreferences } from '../hooks/usePreferences';
import { useProfile } from '../hooks/useProfile';
import { useLatestMeasurementsOnOrBefore } from '../hooks/useMeasurements';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppLocale, formatLocalizedNumber } from '../localization/i18n';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { ServerConfig } from '../services/storage';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDate, getTodayDate } from '../utils/dateUtils';
import { formatEnergy } from '../utils/energyUnit';
import {
  EMPTY_GOAL_SETUP_ANSWERS,
  GOAL_SETUP_QUESTION_COUNT,
  GOAL_SETUP_STEPS,
  MEALS_PER_DAY_OPTIONS,
  isGoalSetupStepAnswered,
  parseDecimalInput,
  safetyFloorFromPreferences,
  suggestGoalTargets,
  type GoalSetupAnswers,
} from '../utils/goalSetup';
import { nutrientAlgorithmsFromPreferences } from '../utils/nutrientAlgorithms';
import {
  cmToFeetInches,
  feetInchesToCm,
  storedWeightInUnit,
  weightToKg,
} from '../utils/unitConversions';

type GoalSetupScreenProps = RootStackScreenProps<'GoalSetup'>;

type WeightUnit = 'kg' | 'lbs';
type HeightUnit = 'cm' | 'ft_in';

const EARLIEST_BIRTH_DATE = '1900-01-01';

const formatOneDecimal = (value: number): string =>
  formatLocalizedNumber(value, {
    maximumFractionDigits: 1,
    useGrouping: false,
  });

const weightText = (kg: number | null, unit: WeightUnit): string =>
  kg === null ? '' : formatOneDecimal(storedWeightInUnit(kg, unit));

const GoalSetupScreen: React.FC<GoalSetupScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const energyUnit = useEnergyUnit();
  const [accentColor, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-disabled',
  ]) as [string, string];
  const fromSignIn = route.params?.fromSignIn === true;

  const { preferences, isLoading: preferencesLoading } = usePreferences();
  const { profile } = useProfile();
  const today = getTodayDate();
  const { latestMeasurements } = useLatestMeasurementsOnOrBefore({
    date: today,
  });

  // Every write goes to the account setup was opened on, even if another
  // becomes active meanwhile.
  const [account, setAccount] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    void goalSetupAccount(queryClient).then((config) => {
      if (!cancelled) setAccount(config);
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const [stepIndex, setStepIndex] = useState(0);
  const step = GOAL_SETUP_STEPS[stepIndex];
  const [answers, setAnswers] = useState<GoalSetupAnswers>(
    EMPTY_GOAL_SETUP_ANSWERS
  );
  const [dietId, setDietId] = useState<string>(DEFAULT_DIET_ID);

  const preferredWeightUnit: WeightUnit =
    (preferences?.default_weight_unit ?? 'kg') === 'kg' ? 'kg' : 'lbs';
  const preferredHeightUnit: HeightUnit =
    (preferences?.default_measurement_unit ?? 'cm') === 'cm' ? 'cm' : 'ft_in';
  // null until the person picks a unit here; the account's unit until then.
  const [chosenWeightUnit, setChosenWeightUnit] = useState<WeightUnit | null>(
    null
  );
  const [chosenHeightUnit, setChosenHeightUnit] = useState<HeightUnit | null>(
    null
  );
  const weightUnit = chosenWeightUnit ?? preferredWeightUnit;
  const heightUnit = chosenHeightUnit ?? preferredHeightUnit;

  const [weightDraft, setWeightDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [cmDraft, setCmDraft] = useState<string | null>(null);
  const [feetDraft, setFeetDraft] = useState<string | null>(null);
  const [inchesDraft, setInchesDraft] = useState<string | null>(null);

  // Start from what the account already holds, once it has loaded (set while
  // rendering, once, rather than in an effect).
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && profile) {
    setPrefilled(true);
    const weight = Number(latestMeasurements?.weight);
    const height = Number(latestMeasurements?.height);
    setAnswers((prev) => ({
      ...prev,
      sex: prev.sex || profile.gender || '',
      birthDate: prev.birthDate || profile.date_of_birth?.slice(0, 10) || '',
      weightKg: prev.weightKg ?? (weight > 0 ? weight : null),
      heightCm: prev.heightCm ?? (height > 0 ? height : null),
    }));
  }

  const update = (patch: Partial<GoalSetupAnswers>) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  const algorithms = useMemo(
    () => nutrientAlgorithmsFromPreferences(preferences),
    [preferences]
  );
  const targets = useMemo(
    () =>
      step === 'plan'
        ? suggestGoalTargets(
            answers,
            dietId,
            algorithms,
            safetyFloorFromPreferences(preferences)
          )
        : null,
    [step, answers, dietId, algorithms, preferences]
  );

  const saveMutation = useSaveGoalSetup();
  const skipMutation = useSkipGoalSetup();
  const busy = saveMutation.isPending || skipMutation.isPending;

  // From Goals the wizard took that screen's place, so it hands back a fresh
  // Goals screen showing what was just saved.
  const leave = () => {
    if (fromSignIn) {
      navigation.replace('Tabs', { screen: 'Dashboard' });
    } else {
      navigation.replace('Goals');
    }
  };

  const handleSkip = () => {
    if (!account) {
      leave();
      return;
    }
    // Leaving never waits on the server: a failed skip only means setup is
    // offered again at the next sign-in.
    skipMutation.mutate(account, { onSettled: leave });
  };

  const handleSave = () => {
    if (!targets || !account) return;
    saveMutation.mutate(
      {
        serverConfig: account,
        answers,
        goals: targets.goals,
        units: {
          weightUnit:
            chosenWeightUnit && chosenWeightUnit !== preferredWeightUnit
              ? chosenWeightUnit
              : undefined,
          measurementUnit:
            chosenHeightUnit && chosenHeightUnit !== preferredHeightUnit
              ? chosenHeightUnit === 'cm'
                ? 'cm'
                : 'ft_in'
              : undefined,
        },
      },
      {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: t('goalSetup.saved', {
              defaultValue: 'Your goals are set.',
            }),
          });
          leave();
        },
        onError: () => {
          Toast.show({
            type: 'error',
            text1: t('common.error', { defaultValue: 'Error' }),
            text2: t('goalSetup.saveFailed', {
              defaultValue: 'Could not save your goals. Please try again.',
            }),
          });
        },
      }
    );
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else if (!fromSignIn) {
      navigation.replace('Goals');
    }
  };

  const header = useScreenHeader({
    title:
      step === 'plan'
        ? t('goalSetup.plan.title', { defaultValue: 'Your plan' })
        : t('goalSetup.stepTitle', {
            defaultValue: 'Step {{step}} of {{total}}',
            step: stepIndex + 1,
            total: GOAL_SETUP_QUESTION_COUNT,
          }),
    left:
      stepIndex > 0 || !fromSignIn
        ? {
            kind: 'text',
            label: t('common.back', { defaultValue: 'Back' }),
            onPress: goBack,
            disabled: busy,
          }
        : undefined,
    right: {
      kind: 'text',
      label: t('goalSetup.skip', { defaultValue: 'Skip' }),
      onPress: handleSkip,
      disabled: busy,
    },
  });

  const radio = (selected: boolean) => (
    <Icon
      name={selected ? 'radio-button-on' : 'radio-button-off'}
      size={24}
      color={selected ? accentColor : formDisabled}
    />
  );

  const title = (text: string, description?: string) => (
    <View className="gap-2 mb-2">
      <Text className="text-xl font-bold text-text-primary">{text}</Text>
      {description ? (
        <Text className="text-text-secondary text-sm">{description}</Text>
      ) : null}
    </View>
  );

  const weightSegments = [
    {
      key: 'kg' as const,
      label: t('goalSetup.units.kg', { defaultValue: 'kg' }),
    },
    {
      key: 'lbs' as const,
      label: t('goalSetup.units.lbs', { defaultValue: 'lbs' }),
    },
  ];

  const onWeightUnit = (unit: WeightUnit) => {
    setChosenWeightUnit(unit);
    setWeightDraft(null);
    setTargetDraft(null);
  };

  const weightInput = (
    field: 'weightKg' | 'targetWeightKg',
    draft: string | null,
    setDraft: (text: string | null) => void,
    testID: string
  ) => (
    <FormInput
      value={draft ?? weightText(answers[field], weightUnit)}
      onChangeText={(text) => {
        setDraft(text);
        const value = parseDecimalInput(text);
        update({
          [field]:
            value === null || value <= 0 ? null : weightToKg(value, weightUnit),
        });
      }}
      editable={!preferencesLoading}
      keyboardType="decimal-pad"
      placeholder={weightUnit}
      accessibilityLabel={weightUnit}
      testID={testID}
    />
  );

  const heightFields = () => {
    const parts =
      answers.heightCm === null ? null : cmToFeetInches(answers.heightCm);
    const setFeetInches = (feetText: string, inchesText: string) => {
      const feet = parseDecimalInput(feetText) ?? 0;
      const inches = parseDecimalInput(inchesText) ?? 0;
      const cm = feetInchesToCm(feet, inches);
      update({ heightCm: cm > 0 ? Math.round(cm * 10) / 10 : null });
    };
    if (heightUnit === 'cm') {
      return (
        <FormInput
          value={
            cmDraft ??
            (answers.heightCm === null
              ? ''
              : formatOneDecimal(answers.heightCm))
          }
          onChangeText={(text) => {
            setCmDraft(text);
            const value = parseDecimalInput(text);
            update({ heightCm: value !== null && value > 0 ? value : null });
          }}
          keyboardType="decimal-pad"
          placeholder={t('goalSetup.units.cm', { defaultValue: 'cm' })}
          accessibilityLabel={t('goalSetup.units.cm', { defaultValue: 'cm' })}
          testID="goal-setup-height-cm"
        />
      );
    }
    const feetText = feetDraft ?? (parts ? String(parts.feet) : '');
    const inchesText =
      inchesDraft ?? (parts ? formatOneDecimal(Math.round(parts.inches)) : '');
    return (
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormInput
            value={feetText}
            onChangeText={(text) => {
              setFeetDraft(text);
              setFeetInches(text, inchesText);
            }}
            keyboardType="number-pad"
            placeholder={t('goalSetup.units.ft', { defaultValue: 'ft' })}
            accessibilityLabel={t('goalSetup.units.ft', { defaultValue: 'ft' })}
            testID="goal-setup-height-ft"
          />
        </View>
        <View className="flex-1">
          <FormInput
            value={inchesText}
            onChangeText={(text) => {
              setInchesDraft(text);
              setFeetInches(feetText, text);
            }}
            keyboardType="decimal-pad"
            placeholder={t('goalSetup.units.in', { defaultValue: 'in' })}
            accessibilityLabel={t('goalSetup.units.in', { defaultValue: 'in' })}
            testID="goal-setup-height-in"
          />
        </View>
      </View>
    );
  };

  const goalLabel = (goal: OnboardingPrimaryGoal): string => {
    switch (goal) {
      case 'lose_weight':
        return t('goalSetup.goal.lose', { defaultValue: 'Lose weight' });
      case 'gain_weight':
        return t('goalSetup.goal.gain', { defaultValue: 'Gain weight' });
      default:
        return t('goalSetup.goal.maintain', {
          defaultValue: 'Maintain weight',
        });
    }
  };

  const activityLabel = (
    level: Exclude<OnboardingActivityLevel, ''>
  ): { title: string; subtitle: string } => {
    switch (level) {
      case 'not_much':
        return {
          title: t('goalSetup.activity.notMuch', { defaultValue: 'Not much' }),
          subtitle: t('goalSetup.activity.notMuchDesc', {
            defaultValue: 'Little or no exercise.',
          }),
        };
      case 'light':
        return {
          title: t('goalSetup.activity.light', {
            defaultValue: 'Light (1-2 days a week)',
          }),
          subtitle: t('goalSetup.activity.lightDesc', {
            defaultValue: 'Light exercise or sports.',
          }),
        };
      case 'moderate':
        return {
          title: t('goalSetup.activity.moderate', {
            defaultValue: 'Moderate (3-5 days a week)',
          }),
          subtitle: t('goalSetup.activity.moderateDesc', {
            defaultValue: 'Moderate exercise or sports.',
          }),
        };
      case 'heavy':
        return {
          title: t('goalSetup.activity.heavy', {
            defaultValue: 'Heavy (6-7 days a week)',
          }),
          subtitle: t('goalSetup.activity.heavyDesc', {
            defaultValue: 'Hard exercise or sports.',
          }),
        };
    }
  };

  const bodyFatLabel = (
    key: (typeof ONBOARDING_BODY_FAT_RANGES)[number]['key']
  ): string => {
    switch (key) {
      case 'low':
        return t('goalSetup.bodyFat.low', { defaultValue: 'Low (under 15%)' });
      case 'medium':
        return t('goalSetup.bodyFat.medium', {
          defaultValue: 'Medium (15-25%)',
        });
      case 'high':
        return t('goalSetup.bodyFat.high', { defaultValue: 'High (25-35%)' });
      case 'veryHigh':
        return t('goalSetup.bodyFat.veryHigh', {
          defaultValue: 'Very high (over 35%)',
        });
    }
  };

  const dietLabel = (id: string): string => {
    switch (id) {
      case 'mediterranean':
        return t('goalSetup.diet.mediterranean', {
          defaultValue: 'Mediterranean',
        });
      case 'dash':
        return t('goalSetup.diet.dash', { defaultValue: 'DASH' });
      case 'atkins':
        return t('goalSetup.diet.atkins', { defaultValue: 'Atkins' });
      case 'low_fat':
        return t('goalSetup.diet.lowFat', { defaultValue: 'Low fat' });
      case 'low_carb':
        return t('goalSetup.diet.lowCarb', {
          defaultValue: 'Low carb / keto',
        });
      default:
        return t('goalSetup.diet.balanced', { defaultValue: 'Balanced' });
    }
  };

  const calendarRef = useRef<CalendarSheetRef>(null);

  const renderStep = () => {
    switch (step) {
      case 'sex':
        return (
          <>
            {title(
              t('goalSetup.sex.title', { defaultValue: 'What is your sex?' }),
              t('goalSetup.sex.description', {
                defaultValue: 'Used to estimate how much energy you burn.',
              })
            )}
            <SettingsRowGroup>
              {(['male', 'female'] as const).map((value) => (
                <SettingsRow
                  key={value}
                  title={
                    value === 'male'
                      ? t('goalSetup.sex.male', { defaultValue: 'Male' })
                      : t('goalSetup.sex.female', { defaultValue: 'Female' })
                  }
                  onPress={() => update({ sex: value })}
                  rightAccessory={radio(answers.sex === value)}
                  testID={`goal-setup-sex-${value}`}
                />
              ))}
            </SettingsRowGroup>
          </>
        );
      case 'goal':
        return (
          <>
            {title(
              t('goalSetup.goal.title', {
                defaultValue: 'What is your main goal?',
              })
            )}
            <SettingsRowGroup>
              {(['lose_weight', 'maintain_weight', 'gain_weight'] as const).map(
                (value) => (
                  <SettingsRow
                    key={value}
                    title={goalLabel(value)}
                    onPress={() => update({ primaryGoal: value })}
                    rightAccessory={radio(answers.primaryGoal === value)}
                    testID={`goal-setup-goal-${value}`}
                  />
                )
              )}
            </SettingsRowGroup>
          </>
        );
      case 'weight':
        return (
          <>
            {title(
              t('goalSetup.weight.title', {
                defaultValue: 'What is your current weight?',
              })
            )}
            <SegmentedControl
              segments={weightSegments}
              activeKey={weightUnit}
              onSelect={onWeightUnit}
            />
            {weightInput(
              'weightKg',
              weightDraft,
              setWeightDraft,
              'goal-setup-weight'
            )}
          </>
        );
      case 'height':
        return (
          <>
            {title(
              t('goalSetup.height.title', {
                defaultValue: 'How tall are you?',
              })
            )}
            <SegmentedControl
              segments={[
                {
                  key: 'cm' as const,
                  label: t('goalSetup.units.cm', { defaultValue: 'cm' }),
                },
                {
                  key: 'ft_in' as const,
                  label: t('goalSetup.height.feetInches', {
                    defaultValue: 'ft / in',
                  }),
                },
              ]}
              activeKey={heightUnit}
              onSelect={(unit) => {
                setChosenHeightUnit(unit);
                setCmDraft(null);
                setFeetDraft(null);
                setInchesDraft(null);
              }}
            />
            {heightFields()}
          </>
        );
      case 'birthDate':
        return (
          <>
            {title(
              t('goalSetup.birthDate.title', {
                defaultValue: 'When were you born?',
              }),
              t('goalSetup.birthDate.description', {
                defaultValue: 'Age changes how much energy you burn.',
              })
            )}
            <SettingsRowGroup>
              <SettingsRow
                icon="calendar"
                title={
                  answers.birthDate
                    ? formatDate(answers.birthDate, locale)
                    : t('goalSetup.birthDate.pick', {
                        defaultValue: 'Pick a date',
                      })
                }
                onPress={() => calendarRef.current?.present()}
                testID="goal-setup-birth-date"
              />
            </SettingsRowGroup>
          </>
        );
      case 'bodyFat':
        return (
          <>
            {title(
              t('goalSetup.bodyFat.title', {
                defaultValue: 'Estimate your body fat',
              }),
              t('goalSetup.bodyFat.description', {
                defaultValue: 'A rough guess is fine.',
              })
            )}
            <SettingsRowGroup>
              {ONBOARDING_BODY_FAT_RANGES.map((range) => (
                <SettingsRow
                  key={range.key}
                  title={bodyFatLabel(range.key)}
                  onPress={() => update({ bodyFatRange: range.value })}
                  rightAccessory={radio(answers.bodyFatRange === range.value)}
                  testID={`goal-setup-body-fat-${range.key}`}
                />
              ))}
            </SettingsRowGroup>
          </>
        );
      case 'targetWeight':
        return (
          <>
            {title(
              t('goalSetup.targetWeight.title', {
                defaultValue: 'What is your goal weight?',
              })
            )}
            <SegmentedControl
              segments={weightSegments}
              activeKey={weightUnit}
              onSelect={onWeightUnit}
            />
            {weightInput(
              'targetWeightKg',
              targetDraft,
              setTargetDraft,
              'goal-setup-target-weight'
            )}
          </>
        );
      case 'meals':
        return (
          <>
            {title(
              t('goalSetup.meals.title', {
                defaultValue: 'How many meals do you eat in a day?',
              })
            )}
            <SettingsRowGroup>
              {MEALS_PER_DAY_OPTIONS.map((count) => (
                <SettingsRow
                  key={count}
                  title={t('goalSetup.meals.option', {
                    defaultValue: '{{count}} meals a day',
                    defaultValue_one: '{{count}} meal a day',
                    defaultValue_other: '{{count}} meals a day',
                    count,
                  })}
                  onPress={() => update({ mealsPerDay: count })}
                  rightAccessory={radio(answers.mealsPerDay === count)}
                  testID={`goal-setup-meals-${count}`}
                />
              ))}
            </SettingsRowGroup>
          </>
        );
      case 'activity':
        return (
          <>
            {title(
              t('goalSetup.activity.title', {
                defaultValue: 'How often do you exercise?',
              })
            )}
            <SettingsRowGroup>
              {(['not_much', 'light', 'moderate', 'heavy'] as const).map(
                (level) => {
                  const label = activityLabel(level);
                  return (
                    <SettingsRow
                      key={level}
                      title={label.title}
                      subtitle={label.subtitle}
                      onPress={() => update({ activityLevel: level })}
                      rightAccessory={radio(answers.activityLevel === level)}
                      testID={`goal-setup-activity-${level}`}
                    />
                  );
                }
              )}
            </SettingsRowGroup>
          </>
        );
      case 'burnedCalories':
        return (
          <>
            {title(
              t('goalSetup.burned.title', {
                defaultValue: 'Add exercise calories to your budget?',
              }),
              t('goalSetup.burned.description', {
                defaultValue:
                  'When you exercise, the calories you burn can be added to what you can eat that day.',
              })
            )}
            <SettingsRowGroup>
              {([true, false] as const).map((value) => (
                <SettingsRow
                  key={String(value)}
                  title={
                    value
                      ? t('common.yes', { defaultValue: 'Yes' })
                      : t('common.no', { defaultValue: 'No' })
                  }
                  onPress={() => update({ addBurnedCalories: value })}
                  rightAccessory={radio(answers.addBurnedCalories === value)}
                  testID={`goal-setup-burned-${value ? 'yes' : 'no'}`}
                />
              ))}
            </SettingsRowGroup>
          </>
        );
      case 'plan':
        return renderPlan();
    }
  };

  const renderPlan = () => {
    if (!targets) {
      return (
        <Text className="text-text-secondary">
          {t('goalSetup.plan.incomplete', {
            defaultValue:
              'Some answers are missing. Go back and fill them in to see your plan.',
          })}
        </Text>
      );
    }
    const { goals } = targets;
    const grams = (value: number) =>
      t('goalSetup.plan.grams', {
        defaultValue: '{{value}} g',
        value: formatLocalizedNumber(value, { maximumFractionDigits: 0 }),
      });
    return (
      <>
        <Text className="text-text-secondary text-sm">
          {t('goalSetup.plan.suggested', {
            defaultValue:
              'Suggested daily goals for your answers. You can change any of them later in Goals.',
          })}
        </Text>
        <View className="bg-surface rounded-xl p-4 gap-1 items-center">
          <Text className="text-text-secondary text-sm">
            {t('goalSetup.plan.calories', {
              defaultValue: 'Daily calories',
            })}
          </Text>
          <Text
            className="text-3xl font-bold text-text-primary"
            testID="goal-setup-plan-calories"
          >
            {formatEnergy(goals.calories, energyUnit, t)}
          </Text>
        </View>
        <SettingsRowGroup>
          <SettingsRow
            title={t('goalSetup.plan.protein', { defaultValue: 'Protein' })}
            rightAccessory={
              <Text className="text-text-primary">{grams(goals.protein)}</Text>
            }
          />
          <SettingsRow
            title={t('goalSetup.plan.carbs', { defaultValue: 'Carbs' })}
            rightAccessory={
              <Text className="text-text-primary">{grams(goals.carbs)}</Text>
            }
          />
          <SettingsRow
            title={t('goalSetup.plan.fat', { defaultValue: 'Fat' })}
            rightAccessory={
              <Text className="text-text-primary">{grams(goals.fat)}</Text>
            }
          />
          <SettingsRow
            title={t('goalSetup.plan.fiber', { defaultValue: 'Fiber' })}
            rightAccessory={
              <Text className="text-text-primary">
                {grams(goals.dietary_fiber)}
              </Text>
            }
          />
          <SettingsRow
            title={t('goalSetup.plan.water', { defaultValue: 'Water' })}
            rightAccessory={
              <Text className="text-text-primary">
                {t('goalSetup.plan.millilitres', {
                  defaultValue: '{{value}} ml',
                  value: formatLocalizedNumber(goals.water_goal_ml, {
                    maximumFractionDigits: 0,
                  }),
                })}
              </Text>
            }
          />
        </SettingsRowGroup>
        <Text className="text-base font-semibold text-text-primary mt-2">
          {t('goalSetup.plan.dietTitle', { defaultValue: 'Eating style' })}
        </Text>
        <SettingsRowGroup>
          {DIET_MACRO_SPLITS.filter((diet) => diet.id !== 'custom').map(
            (diet) => (
              <SettingsRow
                key={diet.id}
                title={dietLabel(diet.id)}
                subtitle={t('goalSetup.plan.split', {
                  defaultValue:
                    'Carbs {{carbs}}% · Protein {{protein}}% · Fat {{fat}}%',
                  carbs: diet.carbs,
                  protein: diet.protein,
                  fat: diet.fat,
                })}
                onPress={() => setDietId(diet.id)}
                rightAccessory={radio(dietId === diet.id)}
                testID={`goal-setup-diet-${diet.id}`}
              />
            )
          )}
        </SettingsRowGroup>
        <View className="bg-surface rounded-xl p-4 gap-2 border border-border-subtle">
          <Text className="text-text-primary font-bold">
            {t('goalSetup.plan.disclaimerTitle', {
              defaultValue: 'Not medical advice',
            })}
          </Text>
          <Text className="text-text-secondary text-sm">
            {t('goalSetup.plan.disclaimer', {
              defaultValue:
                'These goals are estimates for information only. Talk to your doctor or a dietitian before making big changes to what you eat or how you exercise.',
            })}
          </Text>
        </View>
      </>
    );
  };

  const answered = isGoalSetupStepAnswered(step, answers);

  return (
    <View className="flex-1 bg-background">
      {header}
      <View className="px-4 pt-2">
        <View
          className="h-1.5 bg-raised rounded-full overflow-hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: GOAL_SETUP_QUESTION_COUNT,
            now: Math.min(stepIndex + 1, GOAL_SETUP_QUESTION_COUNT),
          }}
        >
          <View
            className="h-full bg-accent-primary"
            style={{
              width: `${(Math.min(stepIndex + 1, GOAL_SETUP_QUESTION_COUNT) / GOAL_SETUP_QUESTION_COUNT) * 100}%`,
            }}
          />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 16,
          paddingBottom: insets.bottom + 24,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}
      </ScrollView>
      <FooterActionBar>
        {step === 'plan' ? (
          saveMutation.isPending ? (
            <ActivityIndicator size="large" color={accentColor} />
          ) : (
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={!targets || !account || busy}
              testID="goal-setup-save"
            >
              {t('goalSetup.plan.start', { defaultValue: 'Start my plan' })}
            </Button>
          )
        ) : (
          <Button
            variant="primary"
            onPress={() => setStepIndex((i) => i + 1)}
            disabled={!answered || busy}
            testID="goal-setup-continue"
          >
            {t('common.continue', { defaultValue: 'Continue' })}
          </Button>
        )}
      </FooterActionBar>
      <CalendarSheet
        ref={calendarRef}
        selectedDate={answers.birthDate || '1990-01-01'}
        onSelectDate={(date) => update({ birthDate: date })}
        minDate={EARLIEST_BIRTH_DATE}
        maxDate={today}
      />
    </View>
  );
};

export default GoalSetupScreen;
