import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useWeightPlateau } from '../hooks/useWeightPlateau';

/**
 * A calm note shown when the weight trend has levelled off while the Goal Mode
 * aims to lose or gain (shared `detectWeightPlateau`). Neutral wording only: it
 * describes the trend and lists things worth checking, never a judgement.
 * Renders nothing when there is no plateau or it was dismissed.
 */
const WeightPlateauCard: React.FC<{ enabled?: boolean }> = ({
  enabled = true,
}) => {
  const { t } = useTranslation();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const { plateau, dismiss } = useWeightPlateau({ enabled });
  if (!plateau) return null;

  const suggestions = [
    t('weightPlateau.suggestionLogging', {
      defaultValue:
        'Logging: check that most meals, snacks and drinks are logged, weekends included.',
    }),
    t('weightPlateau.suggestionAdaptive', {
      defaultValue:
        'Adaptive TDEE: if your calorie target is adaptive, it may still be adjusting to your recent data.',
    }),
    t('weightPlateau.suggestionNoise', {
      defaultValue:
        'Water and scale noise: salt, carbohydrates, training, sleep and hormones can hide a change for a week or two.',
    }),
    t('weightPlateau.suggestionMaintenance', {
      defaultValue:
        'Time at maintenance: a planned stretch at maintenance calories is a reasonable choice too.',
    }),
  ];

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      testID="weight-plateau-card"
    >
      <View className="flex-row items-start justify-between mb-2">
        <Text className="flex-1 text-md font-bold text-text-secondary mr-2">
          {t('weightPlateau.title', {
            defaultValue: 'Your weight trend has levelled off',
          })}
        </Text>
        <Pressable
          testID="weight-plateau-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('weightPlateau.dismiss', {
            defaultValue: 'Dismiss',
          })}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={dismiss}
        >
          <Icon name="close" size={16} color={textMuted} />
        </Pressable>
      </View>
      <Text className="text-sm text-text-primary mb-2">
        {t('weightPlateau.summary', {
          count: plateau.days,
          weighIns: plateau.weighIns,
          defaultValue:
            'Your smoothed weight trend has stayed in a narrow range for {{count}} days ({{weighIns}} weigh-ins).',
          defaultValue_one:
            'Your smoothed weight trend has stayed in a narrow range for {{count}} day ({{weighIns}} weigh-ins).',
          defaultValue_other:
            'Your smoothed weight trend has stayed in a narrow range for {{count}} days ({{weighIns}} weigh-ins).',
        })}
      </Text>
      <Text className="text-sm text-text-muted mb-1">
        {t('weightPlateau.intro', {
          defaultValue:
            'This is common and happens to most people at some point. A few things worth a look:',
        })}
      </Text>
      {suggestions.map((text) => (
        <Text key={text} className="text-sm text-text-muted mt-1">
          {`• ${text}`}
        </Text>
      ))}
    </View>
  );
};

export default WeightPlateauCard;
