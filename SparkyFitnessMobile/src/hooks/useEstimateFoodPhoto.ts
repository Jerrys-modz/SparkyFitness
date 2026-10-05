import { useMutation } from '@tanstack/react-query';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { addLog } from '../services/LogService';
import Toast from 'react-native-toast-message';
import {
  estimateFoodPhoto,
  FoodPhotoEstimateError,
  matchFoodPhotoEstimate,
  type EstimateFoodPhotoInput,
} from '../services/api/externalFoodSearchApi';
import {
  estimateFoodPhotoOnDevice,
  MAX_ON_DEVICE_PHOTOS,
} from '../services/onDeviceFoodPhoto';

const GRAMS_PER_OUNCE = 28.3495;

export function useEstimateFoodPhoto() {
  const { t } = useTranslation();
  return useMutation<
    FoodPhotoEstimateResponse,
    FoodPhotoEstimateError,
    EstimateFoodPhotoInput & { skipOnDevice?: boolean }
  >({
    mutationFn: async ({ skipOnDevice, ...input }) => {
      // A few photos of one meal can stay on the phone; more go to the server.
      const images = input.images ?? [];
      if (
        !skipOnDevice &&
        images.length >= 1 &&
        images.length <= MAX_ON_DEVICE_PHOTOS
      ) {
        const totalWeightGrams =
          input.totalWeight === undefined
            ? undefined
            : input.weightUnit === 'oz'
              ? input.totalWeight * GRAMS_PER_OUNCE
              : input.totalWeight;
        const onDevice = await estimateFoodPhotoOnDevice({
          base64Images: images.map((image) => image.base64Image),
          description: input.description,
          totalWeightGrams,
        });
        if (onDevice) {
          // The on-device model knows nothing about the user's foods. The server
          // can offer them; if it cannot, the estimate is still usable as is.
          let result = onDevice;
          try {
            result = await matchFoodPhotoEstimate(onDevice);
          } catch (error) {
            addLog(
              `[Food Photo] Matching the on-device estimate failed: ${String(error)}`,
              'INFO'
            );
          }
          Toast.show({
            type: 'info',
            text1: t('foodPhotoImprove.estimatedOnDevice', {
              defaultValue: 'Estimated on this iPhone',
            }),
          });
          return result;
        }
      }
      return estimateFoodPhoto(input);
    },
  });
}
