import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import BottomSheetPicker from './BottomSheetPicker';
import { cardioSessionDetailQueryKey } from '../hooks/queryKeys';
import { useAssignBike, useBikes } from '../hooks/useBikes';
import { addLog } from '../services/LogService';
import { fetchExerciseEntry } from '../services/api/exerciseStatsApi';

const NO_BIKE = 'none';

interface BikePickerCardProps {
  exerciseEntryId: string;
}

/**
 * Lets the person say which bike a ride was done on. Hidden until there is a
 * bike to choose, or one is already linked.
 */
const BikePickerCard: React.FC<BikePickerCardProps> = ({ exerciseEntryId }) => {
  const { t } = useTranslation();
  const { bikes } = useBikes();
  const assignBike = useAssignBike();
  // Same key and fetcher as `useCardioSessionDetail`, so the entry is shared.
  const entryQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('entry', exerciseEntryId),
    queryFn: () => fetchExerciseEntry(exerciseEntryId),
  });

  const currentBikeId = entryQuery.data?.bike_id ?? null;
  const options = [
    { label: t('bikes.noBike', { defaultValue: 'No bike' }), value: NO_BIKE },
    ...bikes
      .filter((bike) => bike.status === 'active' || bike.id === currentBikeId)
      .map((bike) => ({
        label:
          bike.name +
          (bike.status === 'retired'
            ? ` (${t('bikes.retired', { defaultValue: 'Retired' })})`
            : ''),
        value: bike.id,
      })),
  ];

  if (entryQuery.isLoading || (bikes.length === 0 && !currentBikeId)) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold mb-3">
        {t('bikes.bike', { defaultValue: 'Bike' })}
      </Text>
      <BottomSheetPicker
        value={currentBikeId ?? NO_BIKE}
        options={options}
        title={t('bikes.bike', { defaultValue: 'Bike' })}
        onSelect={(value) => {
          assignBike.mutate(
            {
              exerciseEntryId,
              bikeId: value === NO_BIKE ? null : value,
            },
            {
              onError: (error) => {
                addLog(`Failed to assign bike: ${error}`, 'ERROR');
                Toast.show({
                  type: 'error',
                  text1: t('bikes.assignFailed', {
                    defaultValue: 'Failed to assign bike',
                  }),
                  text2: t('common.tryAgain', {
                    defaultValue: 'Please try again.',
                  }),
                });
              },
            }
          );
        }}
      />
    </View>
  );
};

export default BikePickerCard;
