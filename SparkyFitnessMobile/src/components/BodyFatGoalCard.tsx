import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  BODY_FAT_GOAL_MAX_PERCENT,
  BODY_FAT_GOAL_MIN_PERCENT,
  isValidBodyFatGoal,
  parseBodyFatGoal,
  roundBodyFatPercent,
} from '@workspace/shared';
import FormInput from './FormInput';
import Button from './ui/Button';
import { useProfile, useSetTargetBodyFat } from '../hooks/useProfile';
import { formatLocalizedNumber } from '../localization';

const parseInput = (text: string): number => Number(text.replace(',', '.'));

/**
 * The body fat % goal on the Goals screen. It is stored next to the goal
 * weight on the profile, not with the daily goals, so it saves on its own
 * buttons rather than the screen's Save.
 */
const BodyFatGoalCard: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { mutateAsync, isPending } = useSetTargetBodyFat();

  const saved = parseBodyFatGoal(profile?.target_body_fat_percentage);
  const savedText =
    saved === null
      ? ''
      : formatLocalizedNumber(saved, { maximumFractionDigits: 1 });
  // null while untouched, so a profile that loads later still shows.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? savedText;
  const parsed = parseInput(value);
  const isValid = value.trim() !== '' && isValidBodyFatGoal(parsed);
  const showError = draft !== null && draft.trim() !== '' && !isValid;

  const save = async (next: number | null) => {
    try {
      await mutateAsync(next);
      setDraft(null);
      Toast.show({
        type: 'success',
        text1:
          next === null
            ? t('goals.bodyFat.cleared', {
                defaultValue: 'Body fat goal cleared.',
              })
            : t('goals.bodyFat.saved', {
                defaultValue: 'Body fat goal saved.',
              }),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.bodyFat.failed', {
          defaultValue: 'Could not save the body fat goal.',
        }),
      });
    }
  };

  return (
    <View className="gap-2" testID="body-fat-goal-card">
      <Text className="text-sm text-text-secondary">
        {t('goals.bodyFat.description', {
          defaultValue:
            'Your target body fat percentage, for body recomposition. The Body fat chart in Reports draws it as a goal line, projects when you will reach it and estimates the weight it means at your current lean mass.',
        })}
      </Text>
      <Text className="text-xs text-text-muted">
        {t('goals.bodyFat.methodNote', {
          defaultValue:
            'Body fat readings vary a lot between methods (smart scales, calipers, tape formulas, DEXA) and even day to day on the same scale. Compare readings from one method, taken the same way.',
        })}
      </Text>
      <FormInput
        value={value}
        onChangeText={setDraft}
        keyboardType="decimal-pad"
        placeholder={t('goals.bodyFat.placeholder', {
          defaultValue: 'Body fat goal (%)',
        })}
        accessibilityLabel={t('goals.bodyFat.placeholder', {
          defaultValue: 'Body fat goal (%)',
        })}
        testID="body-fat-goal-input"
      />
      {showError && (
        <Text className="text-xs text-text-danger" testID="body-fat-goal-error">
          {t('goals.bodyFat.invalid', {
            defaultValue: 'Enter a body fat goal from {{min}}% to {{max}}%.',
            min: BODY_FAT_GOAL_MIN_PERCENT,
            max: BODY_FAT_GOAL_MAX_PERCENT,
          })}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={isPending || draft === null || !isValid}
          loading={isPending}
          onPress={() => void save(roundBodyFatPercent(parsed))}
          className="py-2"
          textClassName="text-sm"
          testID="body-fat-goal-save"
        >
          {t('goals.bodyFat.save', { defaultValue: 'Save body fat goal' })}
        </Button>
        {saved !== null && (
          <Button
            variant="secondary"
            disabled={isPending}
            onPress={() => void save(null)}
            className="py-2"
            textClassName="text-sm"
            testID="body-fat-goal-clear"
          >
            {t('goals.bodyFat.clear', { defaultValue: 'Clear' })}
          </Button>
        )}
      </View>
    </View>
  );
};

export default BodyFatGoalCard;
