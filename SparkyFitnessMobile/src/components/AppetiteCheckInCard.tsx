import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  APPETITE_SCORE_MAX,
  APPETITE_SCORE_MIN,
  appetiteMetricsFor,
  type AppetiteCheckInVariant,
  type AppetiteMetricKey,
} from '@workspace/shared';

import Button from './ui/Button';
import { useAppetiteCheckIn } from '../hooks/useAppetiteCheckIn';
import { appetiteMetricLabel } from '../utils/appetiteLabels';
import { addLog } from '../services/LogService';

const SCORES = Array.from(
  { length: APPETITE_SCORE_MAX - APPETITE_SCORE_MIN + 1 },
  (_, i) => APPETITE_SCORE_MIN + i
);

interface AppetiteCheckInCardProps {
  /** Remount the card (key={date}) when the day changes so edits never leak across days. */
  date: string;
  /**
   * `appetite`: hunger, fullness and cravings, for everyone (Measurements).
   * `glp1`: the GLP-1 tracker's daily check-in, which adds energy. Both save
   * the same `GLP *` daily custom measurements the web uses.
   */
  variant: AppetiteCheckInVariant;
}

const AppetiteCheckInCard: React.FC<AppetiteCheckInCardProps> = ({
  date,
  variant,
}) => {
  const { t } = useTranslation();
  const label = (key: AppetiteMetricKey) =>
    appetiteMetricLabel(key, variant, t);
  const { loadedValues, isLoading, save } = useAppetiteCheckIn(
    date,
    variant,
    label
  );
  const [edits, setEdits] = useState<
    Partial<Record<AppetiteMetricKey, number>>
  >({});
  const isGlp = variant === 'glp1';

  const valueFor = (key: AppetiteMetricKey) => edits[key] ?? loadedValues[key];

  const handleSave = () => {
    const values = { ...loadedValues, ...edits };
    save.mutate(values, {
      onSuccess: () => {
        setEdits({});
        Toast.show({
          type: 'success',
          text1: isGlp
            ? t('medications.glp1.checkIn.saved', {
                defaultValue: 'Check-in saved',
              })
            : t('appetite.saved', { defaultValue: 'Check-in saved' }),
        });
      },
      onError: (error) => {
        addLog(`Failed to save ${variant} check-in: ${error.message}`, 'ERROR');
        Toast.show({
          type: 'error',
          text1: isGlp
            ? t('medications.glp1.checkIn.saveFailed', {
                defaultValue: 'Failed to save check-in',
              })
            : t('appetite.saveFailed', {
                defaultValue: 'Failed to save check-in',
              }),
        });
      },
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">
        {isGlp
          ? t('medications.glp1.checkIn.title', {
              defaultValue: 'Daily check-in',
            })
          : t('appetite.title', { defaultValue: 'Hunger & fullness' })}
      </Text>
      <Text className="text-xs text-text-muted mt-0.5 mb-3">
        {isGlp
          ? t('medications.glp1.checkIn.subtitle', {
              defaultValue:
                'How the medication is affecting you today. Saved to your daily measurements.',
            })
          : t('appetite.subtitle', {
              defaultValue:
                'How hungry, full and snacky you felt today, from 0 (not at all) to 10 (extremely).',
            })}
      </Text>
      {appetiteMetricsFor(variant).map((metric) => {
        const current = valueFor(metric.key);
        const metricLabel = label(metric.key);
        return (
          <View key={metric.key} className="mb-3">
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-sm font-medium text-text-primary">
                {metricLabel}
              </Text>
              <Text className="text-sm font-semibold text-text-primary">
                {current} / {APPETITE_SCORE_MAX}
              </Text>
            </View>
            <View className="flex-row gap-1">
              {SCORES.map((score) => (
                <TouchableOpacity
                  key={score}
                  onPress={() =>
                    setEdits((prev) => ({ ...prev, [metric.key]: score }))
                  }
                  disabled={isLoading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${metricLabel} ${score}`}
                  accessibilityState={{ selected: current === score }}
                  className={`flex-1 h-9 rounded-md items-center justify-center ${
                    current === score ? 'bg-accent-primary' : 'bg-raised'
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      current === score ? 'text-white' : 'text-text-secondary'
                    }`}
                  >
                    {score}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
      <Button
        variant="primary"
        onPress={handleSave}
        loading={save.isPending}
        disabled={isLoading}
      >
        {isGlp
          ? t('medications.glp1.checkIn.save', {
              defaultValue: 'Save check-in',
            })
          : t('appetite.save', { defaultValue: 'Save check-in' })}
      </Button>
    </View>
  );
};

export default AppetiteCheckInCard;
