import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import BottomSheetPicker from './BottomSheetPicker';
import { cardioSessionDetailQueryKey } from '../hooks/queryKeys';
import { useAssignShoe, useShoes } from '../hooks/useShoes';
import { addLog } from '../services/LogService';
import { fetchExerciseEntry } from '../services/api/exerciseStatsApi';

const NO_SHOE = 'none';

interface ShoePickerCardProps {
  exerciseEntryId: string;
}

/**
 * Lets the person say which pair of shoes a cardio entry was done in. Hidden
 * until there is a pair to choose, or one is already linked.
 */
const ShoePickerCard: React.FC<ShoePickerCardProps> = ({ exerciseEntryId }) => {
  const { t } = useTranslation();
  const { shoes } = useShoes();
  const assignShoe = useAssignShoe();
  // Same key and fetcher as `useCardioSessionDetail`, so the entry is shared.
  const entryQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('entry', exerciseEntryId),
    queryFn: () => fetchExerciseEntry(exerciseEntryId),
  });

  const currentShoeId = entryQuery.data?.shoe_id ?? null;
  const options = [
    { label: t('shoes.noShoe', { defaultValue: 'No shoe' }), value: NO_SHOE },
    ...shoes
      .filter((shoe) => shoe.status === 'active' || shoe.id === currentShoeId)
      .map((shoe) => ({
        label:
          (shoe.nickname || shoe.name) +
          (shoe.status === 'retired'
            ? ` (${t('shoes.retired', { defaultValue: 'Retired' })})`
            : ''),
        value: shoe.id,
      })),
  ];

  if (entryQuery.isLoading || (shoes.length === 0 && !currentShoeId)) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold mb-3">
        {t('shoes.shoe', { defaultValue: 'Shoe' })}
      </Text>
      <BottomSheetPicker
        value={currentShoeId ?? NO_SHOE}
        options={options}
        title={t('shoes.shoe', { defaultValue: 'Shoe' })}
        onSelect={(value) =>
          assignShoe.mutate(
            {
              exerciseEntryId,
              shoeId: value === NO_SHOE ? null : value,
            },
            {
              onError: (error) =>
                addLog(`Failed to assign shoe: ${error}`, 'ERROR'),
            }
          )
        }
      />
    </View>
  );
};

export default ShoePickerCard;
