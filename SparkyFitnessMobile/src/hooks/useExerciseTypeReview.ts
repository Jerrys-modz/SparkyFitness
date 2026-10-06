import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import {
  applyModalitySuggestions,
  fetchModalitySuggestions,
} from '../services/api/exerciseApi';
import { invalidateExerciseLibraryCaches } from './useExerciseMutations';

export const exerciseTypeSuggestionsQueryKey = [
  'exerciseTypeSuggestions',
] as const;

export function useExerciseTypeSuggestions() {
  return useQuery({
    queryKey: exerciseTypeSuggestionsQueryKey,
    queryFn: fetchModalitySuggestions,
    // A review is a one-off pass; never reuse a stale list.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useApplyExerciseTypeSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyModalitySuggestions,
    onSuccess: ({ updated }) => {
      invalidateExerciseLibraryCaches(queryClient);
      void queryClient.invalidateQueries({
        queryKey: exerciseTypeSuggestionsQueryKey,
      });
      Toast.show({
        type: 'success',
        text1: i18n.t('exerciseTypeReview.applied', {
          count: updated,
          defaultValue: 'Updated {{count}} exercises',
          defaultValue_one: 'Updated {{count}} exercise',
        }),
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('exerciseTypeReview.applyFailed', {
          defaultValue: 'Could not update exercises',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });
}
