import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  BUILTIN_COACHES,
  CHAT_TOOL_CATEGORY_SLUGS,
  COACH_DESCRIPTION_MAX_LENGTH,
  COACH_NAME_MAX_LENGTH,
  COACH_PROMPT_MAX_LENGTH,
  CUSTOM_COACHES_MAX,
  type ChatToolCategorySlug,
  type CoachResponse,
} from '@workspace/shared';
import CoachCheckinSettingsSection from '../components/CoachCheckinSettingsSection';
import FormInput from '../components/FormInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import {
  BUILTIN_COACH_DESCRIPTIONS,
  BUILTIN_COACH_NAMES,
  CHAT_TOOL_CATEGORY_LABELS,
} from '../constants/coaches';
import { useCoaches } from '../hooks/useCoaches';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

interface Draft {
  /** The coach being changed, or null for a new one. */
  id: string | null;
  name: string;
  description: string;
  prompt: string;
  categories: ChatToolCategorySlug[];
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  description: '',
  prompt: '',
  categories: ['food', 'exercise'],
};

/**
 * Coaches (#2013): the built-in ones for reference, and the person's own to
 * create, change and delete. A coach is chosen above the chat.
 */
export default function CoachesScreen(_props: RootStackScreenProps<'Coaches'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nativeHeader = useNativeIOSHeadersActive();
  const { coaches, isLoading, isError, refetch, save, remove } = useCoaches();
  const [draft, setDraft] = useState<Draft | null>(null);
  const busy = save.isPending || remove.isPending;
  const atLimit = coaches.length >= CUSTOM_COACHES_MAX;

  const showSaveError = () =>
    Toast.show({
      type: 'error',
      text1: t('coaches.settings.saveFailed', {
        defaultValue: 'Could not save your coaches. Try again.',
      }),
    });

  const edit = (coach: CoachResponse) =>
    setDraft({
      id: coach.id,
      name: coach.name,
      description: coach.description ?? '',
      prompt: coach.system_prompt,
      categories: [...coach.tool_categories],
    });

  const setCategory = (slug: ChatToolCategorySlug, on: boolean) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            categories: on
              ? [...current.categories.filter((item) => item !== slug), slug]
              : current.categories.filter((item) => item !== slug),
          }
        : current
    );

  const canSave =
    !!draft &&
    !!draft.name.trim() &&
    !!draft.prompt.trim() &&
    draft.categories.length > 0;

  const saveDraft = () => {
    if (!draft || !canSave) return;
    save.mutate(
      {
        id: draft.id,
        body: {
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          system_prompt: draft.prompt.trim(),
          // Keep the canonical order whatever order they were switched on in.
          tool_categories: CHAT_TOOL_CATEGORY_SLUGS.filter((slug) =>
            draft.categories.includes(slug)
          ),
        },
      },
      { onSuccess: () => setDraft(null), onError: showSaveError }
    );
  };

  const confirmDelete = (coach: CoachResponse) => {
    Alert.alert(
      t('coaches.settings.deleteTitle', { defaultValue: 'Delete this coach?' }),
      coach.name,
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => remove.mutate(coach.id, { onError: showSaveError }),
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: t('coaches.settings.screenTitle', { defaultValue: 'Coaches' }),
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
        <Text className="text-sm text-text-secondary mb-4">
          {t('coaches.settings.help', {
            defaultValue:
              'A coach is Sparky with a focus: its instructions plus the only tools it may use. Pick one above the chat. Coaches are private to you.',
          })}
        </Text>

        <Text className="text-text-primary font-semibold mb-2">
          {t('coaches.settings.builtinTitle', { defaultValue: 'Built in' })}
        </Text>
        <SettingsRowGroup>
          {BUILTIN_COACHES.map((coach) => (
            <SettingsRow
              key={coach.id}
              title={BUILTIN_COACH_NAMES[coach.key](t)}
              subtitle={BUILTIN_COACH_DESCRIPTIONS[coach.key](t)}
              subtitleNumberOfLines={0}
            />
          ))}
        </SettingsRowGroup>

        <View className="mt-6">
          <CoachCheckinSettingsSection />
        </View>

        <Text className="text-text-primary font-semibold mt-6 mb-2">
          {t('coaches.settings.title', { defaultValue: 'Your coaches' })}
        </Text>

        {isLoading ? (
          <StatusView inline loading />
        ) : isError ? (
          <StatusView
            inline
            title={t('coaches.settings.loadFailed', {
              defaultValue: 'Could not load your coaches.',
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
            {coaches.length === 0 && !draft && (
              <Text className="text-sm text-text-muted mb-3">
                {t('coaches.settings.empty', {
                  defaultValue: 'You have not added a coach yet.',
                })}
              </Text>
            )}

            {coaches.map((coach) => (
              <View key={coach.id} className="bg-surface rounded-xl p-4 mb-3">
                <Text className="text-text-primary font-semibold">
                  {coach.name}
                </Text>
                {!!coach.description && (
                  <Text className="text-text-secondary mt-1">
                    {coach.description}
                  </Text>
                )}
                <View className="flex-row gap-3 mt-2">
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onPress={() => edit(coach)}
                  >
                    {t('common.edit', { defaultValue: 'Edit' })}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onPress={() => confirmDelete(coach)}
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Button>
                </View>
              </View>
            ))}

            {draft ? (
              <View className="bg-surface rounded-xl p-4 gap-3">
                <FormInput
                  value={draft.name}
                  onChangeText={(name) => setDraft({ ...draft, name })}
                  maxLength={COACH_NAME_MAX_LENGTH}
                  placeholder={t('coaches.settings.name', {
                    defaultValue: 'Name',
                  })}
                  accessibilityLabel={t('coaches.settings.name', {
                    defaultValue: 'Name',
                  })}
                />
                <FormInput
                  value={draft.description}
                  onChangeText={(description) =>
                    setDraft({ ...draft, description })
                  }
                  maxLength={COACH_DESCRIPTION_MAX_LENGTH}
                  placeholder={t('coaches.settings.description', {
                    defaultValue: 'Short description (optional)',
                  })}
                  accessibilityLabel={t('coaches.settings.description', {
                    defaultValue: 'Short description (optional)',
                  })}
                />
                <FormInput
                  value={draft.prompt}
                  onChangeText={(prompt) => setDraft({ ...draft, prompt })}
                  maxLength={COACH_PROMPT_MAX_LENGTH}
                  multiline
                  placeholder={t('coaches.settings.promptPlaceholder', {
                    defaultValue:
                      'What should this coach focus on, and how should it talk to you?',
                  })}
                  accessibilityLabel={t('coaches.settings.prompt', {
                    defaultValue: 'Instructions',
                  })}
                />
                <Text className="text-text-primary font-semibold">
                  {t('coaches.settings.tools', {
                    defaultValue: 'Tools this coach may use',
                  })}
                </Text>
                <Text className="text-xs text-text-muted">
                  {t('coaches.settings.toolsHint', {
                    defaultValue:
                      'The coach cannot read or change anything outside these.',
                  })}
                </Text>
                {CHAT_TOOL_CATEGORY_SLUGS.map((slug) => {
                  const label = CHAT_TOOL_CATEGORY_LABELS[slug](t);
                  return (
                    <View
                      key={slug}
                      className="flex-row items-center justify-between"
                    >
                      <Text className="text-text-primary">{label}</Text>
                      <Switch
                        accessibilityLabel={label}
                        value={draft.categories.includes(slug)}
                        onValueChange={(on) => setCategory(slug, on)}
                      />
                    </View>
                  );
                })}
                <View className="flex-row gap-3">
                  <Button
                    variant="primary"
                    disabled={busy || !canSave}
                    onPress={saveDraft}
                  >
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button variant="ghost" onPress={() => setDraft(null)}>
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                variant="outline"
                disabled={atLimit}
                onPress={() => setDraft(EMPTY_DRAFT)}
              >
                {t('coaches.settings.add', { defaultValue: 'Add a coach' })}
              </Button>
            )}
            {atLimit && !draft && (
              <Text className="text-xs text-text-muted mt-2">
                {t('coaches.settings.limit', {
                  defaultValue: 'You have the most coaches allowed.',
                })}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
