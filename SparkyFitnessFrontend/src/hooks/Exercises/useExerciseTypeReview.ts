import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  applyModalitySuggestions,
  getModalitySuggestions,
} from '@/api/Exercises/exerciseModalitySuggestions';
import { useExerciseInvalidation } from '@/hooks/useInvalidateKeys';

const exerciseTypeSuggestionsKey = ['exerciseTypeSuggestions'] as const;

export const useExerciseTypeSuggestions = (enabled: boolean) =>
  useQuery({
    queryKey: exerciseTypeSuggestionsKey,
    queryFn: getModalitySuggestions,
    enabled,
    // A review is a one-off pass; never reuse a stale list.
    staleTime: 0,
    gcTime: 0,
  });

export const useApplyExerciseTypeSuggestions = () => {
  const queryClient = useQueryClient();
  const invalidateExercise = useExerciseInvalidation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: applyModalitySuggestions,
    onSuccess: () => {
      invalidateExercise();
      void queryClient.invalidateQueries({
        queryKey: exerciseTypeSuggestionsKey,
      });
    },
    meta: {
      successMessage: t(
        'exercise.typeReview.applied',
        'Exercise types updated'
      ),
      errorMessage: t(
        'exercise.typeReview.applyFailed',
        'Could not update exercise types'
      ),
    },
  });
};
