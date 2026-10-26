import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ImportWorkoutSplitRequest } from '@workspace/shared';
import { importWorkoutSplit } from '@/api/Exercises/workoutSplits';
import { useExerciseInvalidation } from '@/hooks/useInvalidateKeys';

interface ImportWorkoutSplitVariables {
  splitId: string;
  body: ImportWorkoutSplitRequest;
}

/**
 * Imports a built-in split. The library, presets and plans all change, so the
 * whole exercise family is refreshed. A failure is already toasted by `apiCall`
 * with the server's message.
 */
export const useImportWorkoutSplitMutation = () => {
  const { t } = useTranslation();
  const invalidate = useExerciseInvalidation();
  return useMutation({
    mutationFn: ({ splitId, body }: ImportWorkoutSplitVariables) =>
      importWorkoutSplit(splitId, body),
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'workoutSplits.import.success',
        'Program added. Find its workouts under your presets and plans.'
      ),
    },
  });
};
