import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  createMealFromDiary,
  type CreateMealFromDiaryPayload,
} from '../services/api/mealsApi';
import { invalidateMealCaches } from './useMeals';

interface UseCreateMealFromDiaryOptions {
  onSuccess?: (payload: CreateMealFromDiaryPayload) => void;
}

export function useCreateMealFromDiary(
  options?: UseCreateMealFromDiaryOptions
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateMealFromDiaryPayload) =>
      createMealFromDiary(payload),
    onSuccess: (meal, payload) => {
      // The diary itself is untouched; only the meal library changes.
      invalidateMealCaches(queryClient, meal?.id);
      Toast.show({
        type: 'success',
        text1: t('convertToMeal.success', { defaultValue: 'Meal created' }),
      });
      options?.onSuccess?.(payload);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('convertToMeal.failed', {
          defaultValue: 'Failed to create meal',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  return {
    createMeal: mutation.mutate,
    isPending: mutation.isPending,
  };
}
