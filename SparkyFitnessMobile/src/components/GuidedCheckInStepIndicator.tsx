import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { formatLocalizedNumber } from '../localization';
import Button from './ui/Button';

interface GuidedCheckInStepIndicatorProps {
  step: number;
  total: number;
  /** Shown as a Skip action when set; the last step has none. */
  onSkip?: () => void;
  skipDisabled?: boolean;
}

/**
 * "Check-in: Step N of 3" with a segmented bar, pinned between a step's header
 * and its content so it reads the same on the native and the custom header.
 */
const GuidedCheckInStepIndicator: React.FC<GuidedCheckInStepIndicatorProps> = ({
  step,
  total,
  onSkip,
  skipDisabled,
}) => {
  const { t } = useTranslation();
  const label = t('guidedCheckIn.stepOfTotal', {
    defaultValue: 'Check-in: Step {{step}} of {{total}}',
    step: formatLocalizedNumber(step),
    total: formatLocalizedNumber(total),
  });

  return (
    <View className="px-4 pt-2 gap-1.5">
      <View className="flex-row items-center justify-between gap-3">
        <Text
          className="flex-1 text-xs font-semibold text-text-secondary"
          accessibilityRole="header"
        >
          {label}
        </Text>
        {onSkip ? (
          <Button
            variant="header"
            tone="neutral"
            onPress={onSkip}
            disabled={skipDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('guidedCheckIn.skipA11y', {
              defaultValue: 'Skip this step',
            })}
          >
            {t('guidedCheckIn.skip', { defaultValue: 'Skip' })}
          </Button>
        ) : null}
      </View>
      <View
        className="flex-row gap-1"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            className={`flex-1 h-1 rounded-full ${
              index < step ? 'bg-accent-primary' : 'bg-progress-track'
            }`}
          />
        ))}
      </View>
    </View>
  );
};

export default GuidedCheckInStepIndicator;
