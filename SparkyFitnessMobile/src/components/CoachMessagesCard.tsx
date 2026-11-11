import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCoachMessages } from '../hooks/useCoachCheckins';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  coachMessageCoachName,
  coachMessageText,
} from '../utils/coachMessageText';

// The Dashboard shows the newest few.
const MAX_SHOWN = 3;

/**
 * What the person's coaches left for them (#2013). Renders nothing when there
 * is no message, which is always the case until check-ins are switched on.
 */
const CoachMessagesCard: React.FC<{ onOpenChat: () => void }> = ({
  onOpenChat,
}) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const setChatCoachId = useAppPreferencesStore((s) => s.setChatCoachId);
  const { messages, dismiss } = useCoachMessages();
  const shown = messages.slice(0, MAX_SHOWN);
  if (shown.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="sparkles" size={16} color={accentPrimary} />
        <Text className="text-md font-bold text-text-secondary">
          {t('coachMessages.title', { defaultValue: 'From your coaches' })}
        </Text>
      </View>
      {shown.map((message) => (
        <View key={message.id} className="flex-row items-start gap-3 mb-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-primary">
              {coachMessageCoachName(message, t)}
            </Text>
            <Text className="text-sm text-text-primary mt-0.5">
              {coachMessageText(message, t)}
            </Text>
            <Pressable
              onPress={() => {
                setChatCoachId(message.coach_id);
                onOpenChat();
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="mt-1 self-start"
            >
              <Text className="text-sm font-semibold text-accent-primary">
                {t('coachMessages.talk', {
                  defaultValue: 'Talk to this coach',
                })}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => dismiss.mutate(message.id)}
            disabled={dismiss.isPending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('coachMessages.dismiss', {
              defaultValue: 'Dismiss',
            })}
          >
            <Icon name="close" size={16} color={accentPrimary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
};

export default CoachMessagesCard;
