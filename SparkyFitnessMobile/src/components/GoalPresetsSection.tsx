import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import FormInput from './FormInput';
import Button from './ui/Button';
import type { GoalPreset } from '../types/goals';

interface GoalPresetsSectionProps {
  presets: GoalPreset[];
  isBusy: boolean;
  onApply: (preset: GoalPreset) => void;
  /** Saves the form's current values; resolves false when they are invalid. */
  onCreate: (name: string) => Promise<boolean>;
  onOverwrite: (preset: GoalPreset) => Promise<void>;
  onRename: (preset: GoalPreset, name: string) => Promise<void>;
  onDelete: (preset: GoalPreset) => Promise<void>;
}

const GoalPresetsSection: React.FC<GoalPresetsSectionProps> = ({
  presets,
  isBusy,
  onApply,
  onCreate,
  onOverwrite,
  onRename,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const confirm = (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void
  ) =>
    Alert.alert(title, message, [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.presets.description', {
          defaultValue:
            'Save the values above as a preset, then apply it to the form later. Applying a preset fills the form; tap Save to make it your goals.',
        })}
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <FormInput
            value={newName}
            onChangeText={setNewName}
            placeholder={t('goals.presets.namePlaceholder', {
              defaultValue: 'Preset name',
            })}
            accessibilityLabel={t('goals.presets.namePlaceholder', {
              defaultValue: 'Preset name',
            })}
            testID="goal-preset-name"
          />
        </View>
        <Button
          variant="secondary"
          disabled={isBusy || newName.trim().length === 0}
          onPress={async () => {
            if (await onCreate(newName.trim())) setNewName('');
          }}
          className="py-3"
          textClassName="text-sm"
          testID="goal-preset-create"
        >
          {t('goals.presets.saveCurrent', { defaultValue: 'Save as preset' })}
        </Button>
      </View>
      {presets.length === 0 && (
        <Text className="text-sm text-text-muted">
          {t('goals.presets.empty', {
            defaultValue: 'No goal presets yet.',
          })}
        </Text>
      )}
      {presets.map((preset) => {
        const id = preset.id ?? preset.preset_name;
        const isRenaming = renamingId === id;
        return (
          <View key={id} className="gap-2 rounded-lg bg-raised p-3">
            {isRenaming ? (
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <FormInput
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    accessibilityLabel={t('goals.presets.rename', {
                      defaultValue: 'Rename',
                    })}
                  />
                </View>
                <Button
                  variant="secondary"
                  disabled={isBusy || renameText.trim().length === 0}
                  onPress={async () => {
                    await onRename(preset, renameText.trim());
                    setRenamingId(null);
                  }}
                  className="py-2"
                  textClassName="text-xs"
                >
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => setRenamingId(null)}
                  className="py-2"
                  textClassName="text-xs"
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
              </View>
            ) : (
              <>
                <Text className="text-base font-semibold text-text-primary">
                  {preset.preset_name}
                </Text>
                <Text className="text-sm text-text-secondary">
                  {t('goals.presets.summary', {
                    defaultValue:
                      '{{calories}} kcal, {{protein}}g P, {{carbs}}g C, {{fat}}g F',
                    calories: Math.round(preset.calories ?? 0),
                    protein: Math.round(preset.protein ?? 0),
                    carbs: Math.round(preset.carbs ?? 0),
                    fat: Math.round(preset.fat ?? 0),
                  })}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onPress={() => onApply(preset)}
                    className="py-2"
                    textClassName="text-xs"
                    testID={`goal-preset-apply-${id}`}
                  >
                    {t('goals.presets.apply', { defaultValue: 'Apply' })}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isBusy}
                    onPress={() =>
                      confirm(
                        t('goals.presets.updateTitle', {
                          defaultValue: 'Update preset?',
                        }),
                        t('goals.presets.updateMessage', {
                          defaultValue:
                            'Replace "{{name}}" with the values currently in the form?',
                          name: preset.preset_name,
                        }),
                        t('goals.presets.updateConfirm', {
                          defaultValue: 'Update',
                        }),
                        () => void onOverwrite(preset)
                      )
                    }
                    className="py-2"
                    textClassName="text-xs"
                  >
                    {t('goals.presets.update', {
                      defaultValue: 'Update from form',
                    })}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isBusy}
                    onPress={() => {
                      setRenamingId(id);
                      setRenameText(preset.preset_name);
                    }}
                    className="py-2"
                    textClassName="text-xs"
                  >
                    {t('goals.presets.rename', { defaultValue: 'Rename' })}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isBusy}
                    onPress={() =>
                      confirm(
                        t('goals.presets.deleteTitle', {
                          defaultValue: 'Delete preset?',
                        }),
                        t('goals.presets.deleteMessage', {
                          defaultValue: 'Delete "{{name}}"?',
                          name: preset.preset_name,
                        }),
                        t('common.delete', { defaultValue: 'Delete' }),
                        () => void onDelete(preset)
                      )
                    }
                    className="py-2"
                    textClassName="text-xs"
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Button>
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default GoalPresetsSection;
