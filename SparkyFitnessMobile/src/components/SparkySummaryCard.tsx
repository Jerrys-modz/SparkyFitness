import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useSparkyDailySummary } from '../hooks/useAssistant';
import { getDateRelationToToday } from '../utils/dateUtils';

interface SparkySummaryCardProps {
  selectedDate: string;
  onOpenChat: () => void;
}

/**
 * Sparky's short summary of today with one or two suggestions (#2013). It is
 * about today only, so it stays off the Dashboard while another day is shown.
 */
const SparkySummaryCard: React.FC<SparkySummaryCardProps> = ({
  selectedDate,
  onOpenChat,
}) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const isToday = getDateRelationToToday(selectedDate) === 'today';
  const { summary, isLoading, isError, isRefreshing, refresh } =
    useSparkyDailySummary(isToday);

  if (!isToday) return null;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View className="flex-row items-center gap-2">
        <ActivityIndicator size="small" color={accentPrimary} />
        <Text className="text-sm text-text-muted">
          {t('sparkySummary.loading', {
            defaultValue: 'Sparky is looking at your day…',
          })}
        </Text>
      </View>
    );
  } else if (isError && !summary) {
    body = (
      <Text className="text-sm text-text-muted">
        {t('sparkySummary.error', {
          defaultValue:
            'Sparky could not write a summary right now. Tap refresh to try again.',
        })}
      </Text>
    );
  } else if (summary?.status === 'no_ai_service') {
    body = (
      <Text className="text-sm text-text-muted">
        {t('sparkySummary.noAiService', {
          defaultValue:
            'Set up an AI service in Settings to get a daily summary.',
        })}
      </Text>
    );
  } else if (summary?.status === 'no_data') {
    body = (
      <Text className="text-sm text-text-muted">
        {t('sparkySummary.noData', {
          defaultValue:
            'Log a meal, a workout or some water and Sparky will sum up your day here.',
        })}
      </Text>
    );
  } else if (summary?.summary) {
    body = (
      <>
        <Text className="text-base text-text-primary">{summary.summary}</Text>
        {summary.suggestions.map((suggestion) => (
          <View key={suggestion} className="flex-row mt-2">
            <Text className="text-sm text-text-secondary mr-2">•</Text>
            <Text className="text-sm text-text-secondary flex-1">
              {suggestion}
            </Text>
          </View>
        ))}
        <Pressable
          onPress={onOpenChat}
          hitSlop={8}
          accessibilityRole="button"
          className="mt-3 self-start"
        >
          <Text className="text-sm font-semibold text-accent-primary">
            {t('sparkySummary.openChat', { defaultValue: 'Ask Sparky more' })}
          </Text>
        </Pressable>
      </>
    );
  } else {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Icon name="sparkles" size={16} color={accentPrimary} />
          <Text className="text-md font-bold text-text-secondary">
            {t('sparkySummary.title', { defaultValue: 'Today with Sparky' })}
          </Text>
        </View>
        {isRefreshing ? (
          <ActivityIndicator size="small" color={accentPrimary} />
        ) : (
          <Pressable
            onPress={refresh}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('sparkySummary.refresh', {
              defaultValue: 'Write a new summary',
            })}
          >
            <Icon name="replay" size={16} color={accentPrimary} />
          </Pressable>
        )}
      </View>
      {body}
    </View>
  );
};

export default SparkySummaryCard;
