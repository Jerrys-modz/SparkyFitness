import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  assistantPreferenceKey,
  assistantPreferenceLabel,
  type FoodAssistantPreference,
} from '@workspace/shared';
import FormInput from '../components/FormInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { preferencesQueryKey } from '../hooks/queryKeys';
import { useSavedPreferences } from '../hooks/useAssistant';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { updatePreferences } from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

const MAX_VALUE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;

/**
 * What Sparky remembers about the person (#2013): the switch that lets Sparky
 * use saved preferences, and the list to add, change or delete them.
 */
export default function SparkyMemoryScreen(
  _props: RootStackScreenProps<'SparkyMemory'>
) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const { preferences: account, isLoading: accountLoading } = usePreferences();
  const { preferences, isLoading, isError, refetch, save, remove } =
    useSavedPreferences();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');

  const showSaveError = () =>
    Toast.show({
      type: 'error',
      text1: t('sparkyMemory.saveFailed', {
        defaultValue: 'Could not save. Check the list and try again.',
      }),
    });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      updatePreferences({ assistant_memory_enabled: enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesQueryKey, data);
    },
    onError: showSaveError,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
  });

  const memoryEnabled = account?.assistant_memory_enabled !== false;
  const busy = save.isPending || remove.isPending;

  const saveEdit = (preference: FoodAssistantPreference) => {
    save.mutate(
      {
        key: preference.key,
        value: editValue.trim(),
        expectedVersion: preference.version,
      },
      { onSuccess: () => setEditingKey(null), onError: showSaveError }
    );
  };

  const addPreference = () => {
    const key = assistantPreferenceKey(newName, Date.now().toString(36));
    const existing = preferences.find((preference) => preference.key === key);
    save.mutate(
      {
        key,
        value: newValue.trim(),
        expectedVersion: existing?.version ?? 0,
      },
      {
        onSuccess: () => {
          setNewName('');
          setNewValue('');
        },
        onError: showSaveError,
      }
    );
  };

  const confirmDelete = (preference: FoodAssistantPreference) => {
    Alert.alert(
      t('sparkyMemory.deleteTitle', { defaultValue: 'Delete this?' }),
      t('sparkyMemory.deleteMessage', {
        defaultValue: 'Sparky will no longer remember it.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => remove.mutate(preference, { onError: showSaveError }),
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: t('sparkyMemory.title', { defaultValue: 'What Sparky remembers' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={nativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80,
        }}
        contentInsetAdjustmentBehavior={nativeHeader ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading || accountLoading ? (
          <StatusView inline loading />
        ) : isError ? (
          <StatusView
            inline
            title={t('sparkyMemory.loadFailed', {
              defaultValue: 'Could not load what Sparky remembers.',
            })}
            action={{
              label: t('common.retry', { defaultValue: 'Retry' }),
              onPress: () => {
                void refetch();
              },
            }}
          />
        ) : (
          <>
            <SettingsRowGroup>
              <SettingsRow
                title={t('sparkyMemory.enable', {
                  defaultValue: 'Let Sparky use this',
                })}
                subtitleNumberOfLines={0}
                subtitle={t('sparkyMemory.enableHint', {
                  defaultValue:
                    'Sparky keeps to these in chat and in the daily summary, on web and mobile. Turning this off keeps the list but Sparky stops reading and adding to it.',
                })}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t('sparkyMemory.enable', {
                      defaultValue: 'Let Sparky use this',
                    })}
                    value={memoryEnabled}
                    disabled={toggle.isPending}
                    onValueChange={(value) => toggle.mutate(value)}
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-sm text-text-secondary mt-4 mb-3">
              {t('sparkyMemory.help', {
                defaultValue:
                  'Things you told Sparky to keep in mind, such as your diet, allergies, foods you avoid, goals or how you like to be coached. This is what you said, kept apart from what you log. It is private to you and never shared with family.',
              })}
            </Text>

            {preferences.length === 0 && (
              <Text className="text-sm text-text-muted mb-3">
                {t('sparkyMemory.empty', {
                  defaultValue:
                    'Nothing saved yet. Add something below, or tell Sparky in chat, for example "Remember that I am vegetarian".',
                })}
              </Text>
            )}

            {preferences.map((preference) => (
              <View
                key={preference.key}
                className="bg-surface rounded-xl p-4 mb-3"
              >
                <Text className="text-text-primary font-semibold capitalize">
                  {assistantPreferenceLabel(preference.key)}
                </Text>
                {editingKey === preference.key ? (
                  <View className="gap-3 mt-2">
                    <FormInput
                      value={editValue}
                      onChangeText={setEditValue}
                      maxLength={MAX_VALUE_LENGTH}
                      multiline
                      accessibilityLabel={t('sparkyMemory.valueLabel', {
                        defaultValue: 'What to remember',
                      })}
                    />
                    <View className="flex-row gap-3">
                      <Button
                        variant="primary"
                        disabled={busy || !editValue.trim()}
                        onPress={() => saveEdit(preference)}
                      >
                        {t('common.save', { defaultValue: 'Save' })}
                      </Button>
                      <Button
                        variant="ghost"
                        onPress={() => setEditingKey(null)}
                      >
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </Button>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text className="text-text-secondary mt-1">
                      {preference.value}
                    </Text>
                    <View className="flex-row gap-3 mt-2">
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onPress={() => {
                          setEditingKey(preference.key);
                          setEditValue(preference.value);
                        }}
                      >
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onPress={() => confirmDelete(preference)}
                      >
                        {t('common.delete', { defaultValue: 'Delete' })}
                      </Button>
                    </View>
                  </>
                )}
              </View>
            ))}

            <View className="bg-surface rounded-xl p-4 gap-3">
              <Text className="text-text-primary font-semibold">
                {t('sparkyMemory.addTitle', {
                  defaultValue: 'Add something to remember',
                })}
              </Text>
              <FormInput
                value={newName}
                onChangeText={setNewName}
                maxLength={MAX_NAME_LENGTH}
                placeholder={t('sparkyMemory.namePlaceholder', {
                  defaultValue: 'Topic, e.g. Diet or Coaching style',
                })}
                accessibilityLabel={t('sparkyMemory.nameLabel', {
                  defaultValue: 'Topic',
                })}
              />
              <FormInput
                value={newValue}
                onChangeText={setNewValue}
                maxLength={MAX_VALUE_LENGTH}
                multiline
                placeholder={t('sparkyMemory.valuePlaceholder', {
                  defaultValue: 'e.g. Vegetarian, no mushrooms',
                })}
                accessibilityLabel={t('sparkyMemory.valueLabel', {
                  defaultValue: 'What to remember',
                })}
              />
              <Button
                variant="primary"
                disabled={busy || !newName.trim() || !newValue.trim()}
                onPress={addPreference}
              >
                {t('sparkyMemory.add', { defaultValue: 'Add' })}
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
