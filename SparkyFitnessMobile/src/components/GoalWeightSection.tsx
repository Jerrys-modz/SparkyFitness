import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { addDays } from '@workspace/shared';
import FormInput from './FormInput';
import Button from './ui/Button';
import CalendarSheet, { type CalendarSheetRef } from './CalendarSheet';
import GoalWeightPlanCard from './GoalWeightPlanCard';
import {
  useGoalWeightPlan,
  useProfile,
  useSetTargetWeight,
} from '../hooks/useProfile';
import { usePreferences } from '../hooks/usePreferences';
import { useTodayOnFocus } from '../hooks/useTodayOnFocus';
import { resolveWeightGoal } from '../utils/healthTrendGoals';
import { weightToKg } from '../utils/unitConversions';
import { formatDayLabel } from '../utils/dayLabel';
import { formatLocalizedNumber } from '../localization/i18n';

/** Largest goal the server accepts: its numeric(5,2) column's maximum. */
const MAX_GOAL_WEIGHT_KG = 999.99;

const GoalWeightSection: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const { saveTargetWeight, isSaving } = useSetTargetWeight();
  const today = useTodayOnFocus();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const unit: 'kg' | 'lbs' =
    (preferences?.default_weight_unit ?? 'kg') === 'kg' ? 'kg' : 'lbs';

  const saved = resolveWeightGoal(profile?.target_weight, unit);
  const savedKg = Number(profile?.target_weight);
  const savedText =
    saved === undefined
      ? ''
      : formatLocalizedNumber(saved, {
          maximumFractionDigits: 1,
          useGrouping: false,
        });
  // null means "not edited": show what is saved.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? savedText;
  // The day to reach the goal. undefined: not edited; null: removed.
  const savedDate = profile?.target_weight_date ?? null;
  const [dateDraft, setDateDraft] = useState<string | null | undefined>(
    undefined
  );
  const date = dateDraft === undefined ? savedDate : dateDraft;
  const { plan } = useGoalWeightPlan(saved !== undefined);

  const parsed = Number(text.replace(',', '.'));
  const kg = weightToKg(parsed, unit);
  const isValid =
    text.trim() !== '' &&
    Number.isFinite(parsed) &&
    Math.round(kg * 100) / 100 > 0 &&
    kg <= MAX_GOAL_WEIGHT_KG;
  const dateChanged = dateDraft !== undefined && dateDraft !== savedDate;

  const submit = async (value: number | null) => {
    // Clear the drafts only if they are still the ones this save sent, so an
    // edit made while the request was pending is kept.
    const submitted = draft;
    const submittedDate = dateDraft;
    try {
      await saveTargetWeight(
        value === null
          ? { targetWeightKg: null }
          : {
              // An untouched weight is sent as saved, so changing only the
              // date never rounds the stored goal.
              targetWeightKg: draft === null ? savedKg : value,
              targetDate: dateChanged ? (dateDraft ?? null) : undefined,
            }
      );
      setDraft((current) => (current === submitted ? null : current));
      setDateDraft((current) =>
        current === submittedDate ? undefined : current
      );
      Toast.show({
        type: 'success',
        text1: t('goals.goalWeight.saved', {
          defaultValue: 'Goal weight saved.',
        }),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.goalWeight.saveFailed', {
          defaultValue: 'Failed to save goal weight.',
        }),
      });
    }
  };

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.goalWeight.description', {
          defaultValue:
            'Your target weight. Weight charts use it to show your progress.',
        })}
      </Text>
      <FormInput
        value={text}
        onChangeText={setDraft}
        // Until preferences load the unit is unknown, so a typed value could
        // be read in the wrong unit.
        editable={!isPreferencesLoading}
        keyboardType="decimal-pad"
        placeholder={t('goals.goalWeight.placeholder', {
          unit,
          defaultValue: 'Goal weight ({{unit}})',
        })}
        accessibilityLabel={t('goals.goalWeight.placeholder', {
          unit,
          defaultValue: 'Goal weight ({{unit}})',
        })}
        testID="goal-weight-input"
      />
      {draft !== null && draft.trim() !== '' && !isValid && (
        <Text className="text-sm text-icon-danger">
          {t('goals.goalWeight.invalid', {
            defaultValue: 'Enter a weight above zero.',
          })}
        </Text>
      )}
      <View className="gap-1">
        <Text className="text-xs text-text-secondary">
          {t('goals.goalWeight.dateLabel', {
            defaultValue: 'Target date (optional)',
          })}
        </Text>
        <View className="flex-row items-center">
          <Button
            variant="outline"
            onPress={() => calendarRef.current?.present()}
            testID="goal-weight-date"
          >
            {date
              ? formatDayLabel(date, 'short')
              : t('goals.goalWeight.pickDate', {
                  defaultValue: 'Pick a date',
                })}
          </Button>
          {date ? (
            <Pressable
              className="ml-3 py-2"
              accessibilityRole="button"
              onPress={() => setDateDraft(null)}
              testID="goal-weight-date-clear"
            >
              <Text className="text-accent-primary text-sm">
                {t('goals.goalWeight.removeDate', {
                  defaultValue: 'Remove date',
                })}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="text-xs text-text-secondary">
          {t('goals.goalWeight.dateHint', {
            defaultValue:
              'Pick a day to see the weekly pace it needs. Your calorie goal only changes if you choose to use that pace.',
          })}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="primary"
          onPress={() => submit(kg)}
          disabled={isSaving || (draft === null && !dateChanged) || !isValid}
          testID="goal-weight-save"
        >
          {t('goals.goalWeight.save', { defaultValue: 'Save goal weight' })}
        </Button>
        {saved !== undefined && (
          <Button
            variant="outline"
            onPress={() => submit(null)}
            disabled={isSaving}
            testID="goal-weight-clear"
          >
            {t('goals.goalWeight.clear', { defaultValue: 'Clear' })}
          </Button>
        )}
      </View>
      {saved !== undefined && plan ? (
        <GoalWeightPlanCard data={plan} weightUnit={unit} />
      ) : null}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={date ?? addDays(today, 30)}
        minDate={addDays(today, 1)}
        onSelectDate={setDateDraft}
      />
    </View>
  );
};

export default GoalWeightSection;
