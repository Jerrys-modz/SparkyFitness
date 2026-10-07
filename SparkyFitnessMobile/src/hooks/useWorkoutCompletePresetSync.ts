import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useIsFocused } from '@react-navigation/native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useProfile } from './useProfile';
import { useUpdateWorkoutPreset } from './useWorkoutPresetMutations';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import { getActiveServerConfig } from '../services/storage';
import {
  buildPresetUpdateExercises,
  type AssumedSetValues,
  type AssumedValueSources,
} from '../utils/workoutSession';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';

const UPDATE_PRESET_PROMPT_DELAY_MS = 800;

interface UseWorkoutCompletePresetSyncArgs {
  session: PresetSessionResponse;
  sourcePresetId?: number | null;
  sourceServerConfigId?: string | null;
  completedSetIds: CompletedSetMap;
  plannedSetValues: Record<string, AssumedSetValues>;
  /** Live placeholder inputs; see buildPresetUpdateExercises. */
  assumeSources?: Omit<AssumedValueSources, 'plannedSetValues'>;
  /**
   * Called once there is nothing left to ask: no preset to compare, nothing
   * that needs updating, or the prompt was answered. For callers that keep the
   * check pending until then.
   */
  onSettled?: () => void;
}

export function useWorkoutCompletePresetSync({
  session,
  sourcePresetId,
  sourceServerConfigId,
  completedSetIds,
  plannedSetValues,
  assumeSources,
  onSettled,
}: UseWorkoutCompletePresetSyncArgs) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const isFocused = useIsFocused();
  const { updatePresetAsync } = useUpdateWorkoutPreset();
  const [sourcePreset, setSourcePreset] = useState<WorkoutPreset | null>(null);
  const promptedRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    if (sourcePresetId == null) {
      onSettledRef.current?.();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled) return;
        if (config?.id !== sourceServerConfigId) {
          onSettledRef.current?.();
          return;
        }
        const preset = await getWorkoutPresetById(sourcePresetId);
        if (!cancelled) setSourcePreset(preset);
      } catch {
        // Deleted mid-workout (404) or unreachable — no prompt.
        if (!cancelled) onSettledRef.current?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePresetId, sourceServerConfigId]);

  const presetUpdateExercises = useMemo(
    () =>
      sourcePreset == null
        ? null
        : buildPresetUpdateExercises(session, sourcePreset, {
            completedSetIds,
            plannedSetValues,
            assumeSources,
            // Heavier or lighter than the preset is not worth a prompt.
            structureOnly: true,
          }),
    [sourcePreset, session, completedSetIds, plannedSetValues, assumeSources]
  );

  useEffect(() => {
    if (promptedRef.current || !isFocused) return;
    if (sourcePreset == null) return;
    if (presetUpdateExercises == null) {
      onSettledRef.current?.();
      return;
    }
    if (!sourcePreset.user_id) {
      onSettledRef.current?.();
      return;
    }
    if (profile?.id == null) return;
    if (profile.id !== sourcePreset.user_id) {
      onSettledRef.current?.();
      return;
    }
    const presetId = sourcePreset.id;
    const exercises = presetUpdateExercises;
    const timer = setTimeout(() => {
      promptedRef.current = true;
      Alert.alert(
        t('workoutComplete.confirm.updatePresetTitle', {
          defaultValue: 'Update preset?',
        }),
        t('workoutComplete.confirm.updatePresetMessage', {
          defaultValue:
            'Today\'s workout differs from "{{preset}}". Update the preset to match?',
          preset: sourcePreset.name,
        }),
        [
          {
            text: t('workoutComplete.actions.keepPreset', {
              defaultValue: 'Keep Preset',
            }),
            style: 'cancel',
            onPress: () => onSettledRef.current?.(),
          },
          {
            text: t('workoutComplete.actions.update', {
              defaultValue: 'Update',
            }),
            onPress: () => {
              void (async () => {
                try {
                  await updatePresetAsync({
                    id: presetId,
                    payload: { exercises },
                  });
                  Toast.show({
                    type: 'success',
                    text1: t('workoutComplete.success.presetUpdated', {
                      defaultValue: 'Preset updated',
                    }),
                  });
                } catch {
                  // useUpdateWorkoutPreset already showed the failure toast.
                }
                onSettledRef.current?.();
              })();
            },
          },
        ]
      );
    }, UPDATE_PRESET_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    isFocused,
    sourcePreset,
    presetUpdateExercises,
    profile?.id,
    updatePresetAsync,
    t,
  ]);
}
