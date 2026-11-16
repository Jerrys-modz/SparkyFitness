import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BODY_FAT_GOAL_MAX_PERCENT,
  BODY_FAT_GOAL_MIN_PERCENT,
} from '@workspace/shared';
import FormInput from './FormInput';

interface BodyFatGoalCardProps {
  /** The field's text: the saved goal until edited, empty for no goal. */
  value: string;
  onChange: (text: string) => void;
  /** Shows the range message under the field. */
  invalid: boolean;
}

/**
 * The body fat % goal field on the Goals screen. The screen's Save stores it
 * with the other goals; an emptied field clears it.
 */
const BodyFatGoalCard: React.FC<BodyFatGoalCardProps> = ({
  value,
  onChange,
  invalid,
}) => {
  const { t } = useTranslation();

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
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={t('goals.bodyFat.placeholder', {
          defaultValue: 'Body fat goal (%)',
        })}
        accessibilityLabel={t('goals.bodyFat.placeholder', {
          defaultValue: 'Body fat goal (%)',
        })}
        testID="body-fat-goal-input"
      />
      {invalid && (
        <Text className="text-xs text-text-danger" testID="body-fat-goal-error">
          {t('goals.bodyFat.invalid', {
            defaultValue: 'Enter a body fat goal from {{min}}% to {{max}}%.',
            min: BODY_FAT_GOAL_MIN_PERCENT,
            max: BODY_FAT_GOAL_MAX_PERCENT,
          })}
        </Text>
      )}
      <Text className="text-xs text-text-muted">
        {t('goals.bodyFat.clearHint', {
          defaultValue: 'Leave it empty and save to remove the goal.',
        })}
      </Text>
    </View>
  );
};

export default BodyFatGoalCard;
