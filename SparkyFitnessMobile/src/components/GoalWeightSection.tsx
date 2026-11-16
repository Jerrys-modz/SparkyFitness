import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from '@workspace/shared';
import FormInput from './FormInput';
import Button from './ui/Button';
import CalendarSheet, { type CalendarSheetRef } from './CalendarSheet';
import GoalWeightPlanCard from './GoalWeightPlanCard';
import { useGoalWeightPlan } from '../hooks/useProfile';
import { useTodayOnFocus } from '../hooks/useTodayOnFocus';
import type { GoalWeightDraft } from '../hooks/useGoalWeightDraft';
import { formatDayLabel } from '../utils/dayLabel';

interface GoalWeightSectionProps {
  /** The edited goal weight and date; the screen's Save stores them. */
  draft: GoalWeightDraft;
}

const GoalWeightSection: React.FC<GoalWeightSectionProps> = ({ draft }) => {
  const { t } = useTranslation();
  const today = useTodayOnFocus();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const {
    unit,
    isPreferencesLoading,
    hasSaved,
    text,
    setText,
    clear,
    date,
    setDate,
    invalid,
  } = draft;
  const { plan } = useGoalWeightPlan(hasSaved);

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
        onChangeText={setText}
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
      {invalid && (
        <Text className="text-sm text-icon-danger" testID="goal-weight-error">
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
              onPress={() => setDate(null)}
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
      {hasSaved && text.trim() !== '' ? (
        <Pressable
          accessibilityRole="button"
          onPress={clear}
          testID="goal-weight-clear"
        >
          <Text className="text-accent-primary text-sm">
            {t('goals.goalWeight.clear', { defaultValue: 'Clear' })}
          </Text>
        </Pressable>
      ) : null}
      <Text className="text-xs text-text-muted">
        {t('goals.goalWeight.saveHint', {
          defaultValue: 'Changes are saved with Save at the top.',
        })}
      </Text>
      {hasSaved && plan ? (
        <GoalWeightPlanCard data={plan} weightUnit={unit} />
      ) : null}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={date ?? addDays(today, 30)}
        minDate={addDays(today, 1)}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default GoalWeightSection;
