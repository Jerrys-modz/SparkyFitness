import { useMutation } from '@tanstack/react-query';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  estimateFoodPhoto,
  FoodPhotoEstimateError,
  type EstimateFoodPhotoInput,
} from '../services/api/externalFoodSearchApi';
import { estimateFoodPhotoOnDevice } from '../services/onDeviceFoodPhoto';

const GRAMS_PER_OUNCE = 28.3495;

export function useEstimateFoodPhoto() {
  const { t } = useTranslation();
  return useMutation<
    FoodPhotoEstimateResponse,
    FoodPhotoEstimateError,
    EstimateFoodPhotoInput
  >({
    mutationFn: async (input) => {
      // The on-device model takes one picture; several go to the server.
      const images = input.images ?? [];
      if (images.length === 1) {
        const totalWeightGrams =
          input.totalWeight === undefined
            ? undefined
            : input.weightUnit === 'oz'
              ? input.totalWeight * GRAMS_PER_OUNCE
              : input.totalWeight;
        const onDevice = await estimateFoodPhotoOnDevice({
          base64Image: images[0].base64Image,
          description: input.description,
          totalWeightGrams,
        });
        if (onDevice) {
          Toast.show({
            type: 'info',
            text1: t('foodPhotoImprove.estimatedOnDevice', {
              defaultValue: 'Estimated on this iPhone',
            }),
          });
          return onDevice;
        }
      }
      return estimateFoodPhoto(input);
    },
  });
}
