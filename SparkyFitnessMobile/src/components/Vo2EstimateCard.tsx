import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Switch from './ui/Switch';
import {
  runEstimatesRootQueryKey,
  vo2MaxRangeQueryKeyRoot,
} from '../hooks/queryKeys';
import { addLog } from '../services/LogService';
import { setExerciseEntryVo2Estimate } from '../services/api/exerciseApi';

interface Vo2EstimateCardProps {
  exerciseEntryId: string;
  /** The run is currently left out of the estimated VO2 max. */
  excluded: boolean;
  /** Called with the new choice once the server has saved it. */
  onChanged: (excluded: boolean) => void;
}

/**
 * Lets the person leave one run out of the estimated VO2 max (a race, a trail
 * run, a run with a bad heart rate reading). The run still counts as a run
 * everywhere else. Shown for runs only; the caller decides that.
 */
const Vo2EstimateCard: React.FC<Vo2EstimateCardProps> = ({
  exerciseEntryId,
  excluded,
  onChanged,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shownExcluded, setShownExcluded] = useState(excluded);
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      setExerciseEntryVo2Estimate(exerciseEntryId, next),
    onSuccess: (_data, next) => {
      onChanged(next);
      queryClient.invalidateQueries({ queryKey: runEstimatesRootQueryKey });
      queryClient.invalidateQueries({ queryKey: vo2MaxRangeQueryKeyRoot });
    },
    onError: (error, next) => {
      setShownExcluded(!next);
      addLog(`Failed to update the VO2 max estimate: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('vo2Estimate.saveFailed', {
          defaultValue: 'Failed to update the VO2 max estimate',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  return (
    <View
      className="bg-surface rounded-xl px-4 py-3 mt-4 shadow-sm"
      testID="vo2-estimate-card"
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 mr-3 text-base text-text-primary">
          {t('vo2Estimate.include', {
            defaultValue: 'Use in VO2 max estimate',
          })}
        </Text>
        <Switch
          accessibilityLabel={t('vo2Estimate.include', {
            defaultValue: 'Use in VO2 max estimate',
          })}
          value={!shownExcluded}
          disabled={mutation.isPending}
          onValueChange={(include) => {
            setShownExcluded(!include);
            mutation.mutate(!include);
          }}
        />
      </View>
      <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
        {t('vo2Estimate.hint', {
          defaultValue:
            'Turn off for a race, a trail run or a run with a bad heart rate reading. It still counts as a run everywhere else.',
        })}
      </Text>
    </View>
  );
};

export default Vo2EstimateCard;
