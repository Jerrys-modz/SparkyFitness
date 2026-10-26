import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { ImportWorkoutSplitRequest } from '@workspace/shared';
import i18n from '../localization/i18n';
import { getApiErrorMessage } from '../services/api/errors';
import { importWorkoutSplit } from '../services/api/workoutSplitsApi';
import { invalidateWorkoutPresetCaches } from './useWorkoutPresetMutations';
import { useInvalidateWorkoutPlans } from './useWorkoutPlans';

interface ImportVariables {
  splitId: string;
  body: ImportWorkoutSplitRequest;
}

/**
 * Imports a built-in split. The library, presets and plans all change, so the
 * preset and plan cache families are refreshed together.
 */
export function useImportWorkoutSplit() {
  const queryClient = useQueryClient();
  const invalidatePlans = useInvalidateWorkoutPlans();
  const mutation = useMutation({
    mutationFn: ({ splitId, body }: ImportVariables) =>
      importWorkoutSplit(splitId, body),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
      invalidatePlans();
    },
    onError: (error) => {
      Toast.show({
        type: 'error',
        text1: i18n.t('workoutSplits.import.error', {
          defaultValue: 'Could not add the program',
        }),
        text2:
          getApiErrorMessage(error) ??
          i18n.t('workoutSplits.import.errorHint', {
            defaultValue:
              'The exercise database may not be reachable. Please try again.',
          }),
      });
    },
  });

  return {
    importSplitAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
