import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { moodByName, moodTagForValue } from '@workspace/shared';
import SwipeableDeleteRow from '../SwipeableDeleteRow';
import { getBuiltInMoodLabels } from './moodLabels';
import type { CustomMood, MoodEntry } from '../../services/api/moodApi';

const SNIPPET_MAX = 120;

const snippet = (notes: string | null) => {
  const text = (notes ?? '').trim();
  return text.length > SNIPPET_MAX
    ? `${text.slice(0, SNIPPET_MAX - 1).trimEnd()}…`
    : text;
};

interface MoodCheckinRowProps {
  entry: MoodEntry;
  /** The check-in's time, already in the user's zone and format. */
  time: string;
  customMoods: CustomMood[];
  onPress: () => void;
  onDelete: () => void;
}

/** One check-in of the day: time, mood, energy, focus, tags and a journal line. */
export default function MoodCheckinRow({
  entry,
  time,
  customMoods,
  onPress,
  onDelete,
}: MoodCheckinRowProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => getBuiltInMoodLabels(t), [t]);

  const tag = moodTagForValue(entry.mood_value);
  const mood = tag ? moodByName(tag) : null;
  const tags = (entry.mood_tags ?? []).filter((name) => name.trim() !== '');
  const note = snippet(entry.notes);

  const tagLabel = (name: string) => {
    const builtIn = moodByName(name);
    if (builtIn) {
      return `${builtIn.emoji} ${labels[builtIn.name] ?? builtIn.displayName}`;
    }
    const custom = customMoods.find((m) => m.name === name);
    return `${custom?.icon ? `${custom.icon} ` : ''}${custom?.display_name ?? name}`;
  };

  return (
    <SwipeableDeleteRow title={time} onConfirmDelete={onDelete}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('mood.editCheckinA11y', {
          defaultValue: 'Edit check-in at {{time}}',
          time,
        })}
        className="flex-row gap-3"
      >
        <Text className="w-16 pt-3 text-sm font-semibold text-text-secondary">
          {time}
        </Text>
        <View className="flex-1 bg-surface rounded-xl p-3 gap-1.5">
          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {mood && (
              <Text className="text-sm font-medium text-text-primary">
                {mood.emoji} {labels[mood.name] ?? mood.displayName}
              </Text>
            )}
            {entry.energy_value != null && (
              <Text className="text-sm text-text-primary">
                {t('mood.energyOutOfFive', {
                  defaultValue: 'Energy {{value}}/5',
                  value: entry.energy_value,
                })}
              </Text>
            )}
            {entry.focus_value != null && (
              <Text className="text-sm text-text-primary">
                {t('mood.focusOutOfFive', {
                  defaultValue: 'Focus {{value}}/5',
                  value: entry.focus_value,
                })}
              </Text>
            )}
          </View>
          {tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1">
              {tags.map((name) => (
                <View
                  key={name}
                  className="border border-border rounded-full px-2 py-0.5"
                >
                  <Text className="text-xs text-text-secondary">
                    {tagLabel(name)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {note !== '' && (
            <Text className="text-xs italic text-text-secondary">{note}</Text>
          )}
        </View>
      </Pressable>
    </SwipeableDeleteRow>
  );
}
