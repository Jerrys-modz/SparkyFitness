import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { BUILTIN_COACHES } from '@workspace/shared';
import BottomSheetPicker from '../BottomSheetPicker';
import Icon from '../Icon';
import { BUILTIN_COACH_NAMES } from '../../constants/coaches';
import { useCoaches } from '../../hooks/useCoaches';
import { useAppPreferencesStore } from '../../stores/appPreferencesStore';

// The picker needs a string value; '' stands for plain Sparky.
const SPARKY = '';

/**
 * Coach picker above the chat (#2013). One coach at a time: the choice adds
 * that coach's instructions to the chat and limits it to the coach's tools.
 * Changing it starts a new conversation.
 */
const ChatCoachPicker: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const chatCoachId = useAppPreferencesStore((s) => s.chatCoachId);
  const setChatCoachId = useAppPreferencesStore((s) => s.setChatCoachId);
  const { coaches } = useCoaches();

  const options = useMemo(
    () => [
      {
        value: SPARKY,
        label: t('coaches.sparky.name', { defaultValue: 'Sparky' }),
      },
      ...BUILTIN_COACHES.map((coach) => ({
        value: coach.id,
        label: BUILTIN_COACH_NAMES[coach.key](t),
      })),
      ...coaches.map((coach) => ({ value: coach.id, label: coach.name })),
    ],
    [coaches, t]
  );
  // A coach deleted elsewhere reads as Sparky, which is what the server does.
  const value = options.some((option) => option.value === chatCoachId)
    ? (chatCoachId ?? SPARKY)
    : SPARKY;

  return (
    <BottomSheetPicker
      value={value}
      options={options}
      title={t('coaches.picker.title', { defaultValue: 'Coach' })}
      onSelect={(next) => setChatCoachId(next === SPARKY ? null : next)}
      renderTrigger={({ onPress, selectedOption }) => (
        <View className="px-4 pt-2">
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            accessibilityLabel={t('coaches.picker.a11y', {
              defaultValue: 'Coach: {{name}}. Double tap to change.',
              name: selectedOption?.label ?? '',
            })}
            className={`flex-row items-center self-start gap-2 rounded-full bg-surface px-3 py-1.5 ${
              disabled ? 'opacity-50' : ''
            }`}
          >
            <Icon name="sparkles" size={14} color={accentPrimary} />
            <Text className="text-sm text-text-primary">
              {selectedOption?.label}
            </Text>
            <Icon name="chevron-down" size={12} color={accentPrimary} />
          </Pressable>
        </View>
      )}
    />
  );
};

export default ChatCoachPicker;
