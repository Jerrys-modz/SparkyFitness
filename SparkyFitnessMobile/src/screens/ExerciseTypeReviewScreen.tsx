import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useApplyExerciseTypeSuggestions,
  useExerciseTypeSuggestions,
} from '../hooks/useExerciseTypeReview';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseTypeReviewScreenProps = RootStackScreenProps<'ExerciseTypeReview'>;

const ExerciseTypeReviewScreen: React.FC<
  ExerciseTypeReviewScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accent, muted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  useScreenHeader({
    title: t('screens.exerciseTypeReview', {
      defaultValue: 'Review Exercise Types',
    }),
    left: { kind: 'back' },
  });

  const { data, isLoading, isError, refetch } = useExerciseTypeSuggestions();
  const apply = useApplyExerciseTypeSuggestions();
  // Everything starts selected; the user opts out of the ones to leave alone.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  const chosen = useMemo(
    () => (data ?? []).filter((item) => !skipped.has(item.id)),
    [data, skipped]
  );

  const toggle = (id: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) return <StatusView loading />;
  if (isError) {
    return (
      <StatusView
        icon="alert-circle"
        iconTone="danger"
        title={t('exerciseTypeReview.error', {
          defaultValue: 'Could not load suggestions',
        })}
        action={{
          label: t('exerciseTypeReview.retry', { defaultValue: 'Try again' }),
          onPress: () => void refetch(),
        }}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <StatusView
        icon="checkmark-circle"
        title={t('exerciseTypeReview.empty', {
          defaultValue: 'All your exercises already match',
        })}
        subtitle={t('exerciseTypeReview.emptySubtitle', {
          defaultValue: 'Nothing to change.',
        })}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 96 + insets.bottom + activeWorkoutBarPadding,
        }}
      >
        <Text className="text-sm text-text-secondary px-4 py-3">
          {t('exerciseTypeReview.intro', {
            defaultValue:
              'These exercises would be tracked differently based on their name, category and equipment. Uncheck any you want to leave alone.',
          })}
        </Text>
        {data.map((item) => {
          const selected = !skipped.has(item.id);
          return (
            <Pressable
              key={item.id}
              className="px-4 py-3 flex-row items-center border-b border-border-subtle"
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Icon
                name={selected ? 'checkmark-circle-filled' : 'radio-button-off'}
                size={22}
                color={selected ? accent : muted}
              />
              <View className="flex-1 ml-3">
                <Text className="text-base font-semibold text-text-primary">
                  {item.name}
                </Text>
                <Text className="text-sm text-text-secondary mt-0.5">
                  {t('exerciseTypeReview.change', {
                    from: localizeExerciseTaxonomyValue(
                      t,
                      'modality',
                      item.currentModality
                    ),
                    to: localizeExerciseTaxonomyValue(
                      t,
                      'modality',
                      item.suggestedModality
                    ),
                    defaultValue: '{{from}} → {{to}}',
                  })}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View
        className="absolute left-0 right-0 bottom-0 px-4 pt-3 bg-background border-t border-border-subtle"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <Button
          variant="primary"
          disabled={chosen.length === 0 || apply.isPending}
          onPress={() =>
            apply.mutate(
              chosen.map((item) => ({
                id: item.id,
                modality: item.suggestedModality,
              }))
            )
          }
        >
          {t('exerciseTypeReview.apply', {
            count: chosen.length,
            defaultValue: 'Apply {{count}} change',
            defaultValue_other: 'Apply {{count}} changes',
          })}
        </Button>
      </View>
    </View>
  );
};

export default ExerciseTypeReviewScreen;
