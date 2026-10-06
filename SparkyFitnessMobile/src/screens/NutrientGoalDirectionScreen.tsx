import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { NON_GOAL_NUTRIENT_KEYS } from '@workspace/shared';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import { getNutrientLabel, NUTRIENT_META } from '../constants/nutrients';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useNutrientGoalPreferences } from '../hooks/useNutrientGoalPreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConnection } from '../hooks/useServerConnection';
import { nutrientGoalPreferencesQueryKey } from '../hooks/queryKeys';
import {
  resetNutrientGoalPreference,
  updateNutrientGoalPreference,
  type NutrientGoalType,
} from '../services/api/nutrientGoalPreferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type NutrientGoalDirectionScreenProps =
  RootStackScreenProps<'NutrientGoalDirection'>;

interface RowProps {
  nutrientKey: string;
  label: string;
  unit: string;
  goalType: NutrientGoalType;
  targetMin?: number | null;
  targetMax?: number | null;
  onSave: (
    key: string,
    goalType: NutrientGoalType,
    targetMin?: number,
    targetMax?: number
  ) => void;
  onReset: (key: string) => void;
}

const parseBound = (text: string): number | undefined => {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
};

const NutrientGoalDirectionRow: React.FC<RowProps> = ({
  nutrientKey,
  label,
  unit,
  goalType,
  targetMin,
  targetMax,
  onSave,
  onReset,
}) => {
  const { t } = useTranslation();
  const [minText, setMinText] = useState(
    targetMin != null ? String(targetMin) : ''
  );
  const [maxText, setMaxText] = useState(
    targetMax != null ? String(targetMax) : ''
  );

  // Choosing Range before a band is entered only reveals the inputs; the server
  // rejects a target without both bounds, so nothing is saved until they are valid.
  const [pendingRange, setPendingRange] = useState(false);
  const shownType: NutrientGoalType = pendingRange ? 'target' : goalType;

  const min = parseBound(minText);
  const max = parseBound(maxText);
  const bandValid = min !== undefined && max !== undefined && min <= max;

  const segments = [
    {
      key: 'minimum' as const,
      label: t('nutrientGoalDirection.min', { defaultValue: 'Min' }),
    },
    {
      key: 'maximum' as const,
      label: t('nutrientGoalDirection.max', { defaultValue: 'Max' }),
    },
    {
      key: 'target' as const,
      label: t('nutrientGoalDirection.range', { defaultValue: 'Range' }),
    },
  ];

  const select = (next: NutrientGoalType) => {
    if (next === shownType) return;
    if (next === 'target') {
      if (bandValid) onSave(nutrientKey, 'target', min, max);
      else setPendingRange(true);
      return;
    }
    setPendingRange(false);
    onSave(nutrientKey, next);
  };

  return (
    <View
      testID={`goal-direction-${nutrientKey}`}
      className="px-4 py-3 border-b border-border-subtle"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className="text-base text-text-primary flex-shrink"
          numberOfLines={1}
        >
          {label}
          {unit ? <Text className="text-text-muted">{`  ${unit}`}</Text> : null}
        </Text>
        <Pressable
          testID={`goal-direction-reset-${nutrientKey}`}
          onPress={() => {
            setPendingRange(false);
            onReset(nutrientKey);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('nutrientGoalDirection.resetOne', {
            defaultValue: 'Reset {{name}} to default',
            name: label,
          })}
        >
          <Text className="text-accent-primary text-sm">
            {t('nutrientGoalDirection.reset', { defaultValue: 'Reset' })}
          </Text>
        </Pressable>
      </View>
      <SegmentedControl
        segments={segments}
        activeKey={shownType}
        onSelect={select}
      />
      {shownType === 'target' ? (
        <View className="mt-3">
          <View className="flex-row items-center gap-2">
            <FormInput
              className="flex-1"
              testID={`goal-direction-min-${nutrientKey}`}
              value={minText}
              onChangeText={setMinText}
              keyboardType="decimal-pad"
              placeholder={t('nutrientGoalDirection.minPlaceholder', {
                defaultValue: 'Min',
              })}
            />
            <Text className="text-text-secondary">
              {t('nutrientGoalDirection.to', { defaultValue: 'to' })}
            </Text>
            <FormInput
              className="flex-1"
              testID={`goal-direction-max-${nutrientKey}`}
              value={maxText}
              onChangeText={setMaxText}
              keyboardType="decimal-pad"
              placeholder={t('nutrientGoalDirection.maxPlaceholder', {
                defaultValue: 'Max',
              })}
            />
            <Pressable
              testID={`goal-direction-save-${nutrientKey}`}
              disabled={!bandValid}
              onPress={() =>
                bandValid && onSave(nutrientKey, 'target', min, max)
              }
              accessibilityRole="button"
              style={{ opacity: bandValid ? 1 : 0.4 }}
              className="px-2 py-2"
            >
              <Text className="text-accent-primary font-semibold">
                {t('common.save', { defaultValue: 'Save' })}
              </Text>
            </Pressable>
          </View>
          {!bandValid && (minText !== '' || maxText !== '') ? (
            <Text className="text-xs text-text-muted mt-1">
              {t('nutrientGoalDirection.invalidBand', {
                defaultValue: 'Enter a valid min that is at most max.',
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const NutrientGoalDirectionScreen: React.FC<
  NutrientGoalDirectionScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });
  const { goalPreferences, isLoading, isError, refetch } =
    useNutrientGoalPreferences({ enabled: isConnected });

  const keys = useMemo(
    () =>
      Object.keys(goalPreferences).filter(
        (k) => !(NON_GOAL_NUTRIENT_KEYS as readonly string[]).includes(k)
      ),
    [goalPreferences]
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: nutrientGoalPreferencesQueryKey,
      }),
      // Goal direction changes how progress is computed against goals.
      queryClient.invalidateQueries({ queryKey: ['goals'] }),
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] }),
    ]);

  const onError = () =>
    Toast.show({
      type: 'error',
      text1: t('nutrientGoalDirection.saveFailed', {
        defaultValue: 'Failed to save goal direction.',
      }),
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });

  const saveMutation = useMutation({
    mutationFn: (v: {
      key: string;
      goalType: NutrientGoalType;
      targetMin?: number;
      targetMax?: number;
    }) =>
      updateNutrientGoalPreference(v.key, {
        goalType: v.goalType,
        targetMin: v.targetMin,
        targetMax: v.targetMax,
      }),
    onError,
    onSettled: refresh,
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => resetNutrientGoalPreference(key),
    onError,
    onSettled: refresh,
  });

  const header = useScreenHeader({
    title: t('nutrientGoalDirection.title', { defaultValue: 'Goal Direction' }),
    left: { kind: 'back' },
  });

  const labelFor = (key: string) =>
    NUTRIENT_META[key] ? getNutrientLabel(t, key) : key;
  const unitFor = (key: string) =>
    NUTRIENT_META[key]?.unit ??
    customNutrients.find((n) => n.name === key)?.unit ??
    '';

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <StatusView
        loading
        title={t('nutrientGoalDirection.loading', {
          defaultValue: 'Loading goal directions...',
        })}
      />
    );
  } else if (isError) {
    body = (
      <StatusView
        icon="alert-circle"
        iconTone="danger"
        title={t('nutrientGoalDirection.loadFailed', {
          defaultValue: 'Failed to load goal directions',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => void refetch(),
        }}
      />
    );
  } else {
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-3">
          {t('nutrientGoalDirection.description', {
            defaultValue:
              'Min means more is better, Max means stay under the goal, and Range means land between two values.',
          })}
        </Text>
        <View className="bg-surface rounded-xl shadow-sm mb-4">
          {keys.map((key) => {
            const pref = goalPreferences[key]!;
            return (
              <NutrientGoalDirectionRow
                key={`${key}-${pref.goalType}-${pref.targetMin}-${pref.targetMax}`}
                nutrientKey={key}
                label={labelFor(key)}
                unit={unitFor(key)}
                goalType={pref.goalType}
                targetMin={pref.targetMin}
                targetMax={pref.targetMax}
                onSave={(k, goalType, targetMin, targetMax) =>
                  saveMutation.mutate({
                    key: k,
                    goalType,
                    targetMin,
                    targetMax,
                  })
                }
                onReset={(k) => resetMutation.mutate(k)}
              />
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {body}
    </View>
  );
};

export default NutrientGoalDirectionScreen;
