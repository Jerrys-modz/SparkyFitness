import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  ImportWorkoutProgramRequest,
  WorkoutProgramFile,
} from '@workspace/shared';
import i18n from '../localization/i18n';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
} from '../services/api/workoutProgramsApi';
import {
  InvalidWorkoutProgramFileError,
  pickWorkoutProgramFile,
  shareWorkoutProgramFile,
} from '../services/workoutProgramFiles';
import { invalidateWorkoutPresetCaches } from './useWorkoutPresetMutations';
import { useInvalidateWorkoutPlans } from './useWorkoutPlans';

interface ShareVariables {
  kind: 'preset' | 'plan';
  id: number | string;
  name: string;
}

/**
 * Downloads a preset or plan as a workout program file and opens the share
 * sheet, so it can be sent to anyone with SparkyFitness.
 */
export function useShareWorkoutProgram() {
  const mutation = useMutation({
    mutationFn: async ({ kind, id, name }: ShareVariables) => {
      const file =
        kind === 'preset'
          ? await exportWorkoutPreset(id)
          : await exportWorkoutPlan(id);
      return shareWorkoutProgramFile(file, name);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('workoutPrograms.share.error', {
          defaultValue: 'Could not share the workout',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });
  return {
    shareProgram: mutation.mutate,
    isSharing: mutation.isPending,
  };
}

/**
 * Imports a program file. The library, presets and plans all change, so the
 * preset and plan cache families are refreshed together.
 */
export function useImportWorkoutProgram() {
  const queryClient = useQueryClient();
  const invalidatePlans = useInvalidateWorkoutPlans();
  const mutation = useMutation({
    mutationFn: (body: ImportWorkoutProgramRequest) =>
      importWorkoutProgram(body),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
      invalidatePlans();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('workoutPrograms.import.error', {
          defaultValue: 'Could not add the workouts',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });
  return {
    importProgramAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

/**
 * Lets the person pick a shared workout file and checks it. Resolves to the
 * file, or null when the picker was closed or the file was refused (the
 * reason is toasted). The presets, plans and programs screens all offer it.
 */
export function usePickWorkoutProgramFile(): () => Promise<WorkoutProgramFile | null> {
  const { t } = useTranslation();
  return useCallback(async () => {
    try {
      return await pickWorkoutProgramFile();
    } catch (error: unknown) {
      Toast.show({
        type: 'error',
        text1:
          error instanceof InvalidWorkoutProgramFileError
            ? t('workoutPrograms.import.invalid', {
                defaultValue: 'This is not a SparkyFitness workout file.',
              })
            : t('workoutPrograms.import.readFailed', {
                defaultValue: 'Could not open the file',
              }),
      });
      return null;
    }
  }, [t]);
}
