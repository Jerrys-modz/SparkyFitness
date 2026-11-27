import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExerciseEntryResponse } from '@workspace/shared';

import Vo2EstimateCard from './Vo2EstimateCard';
import { cardioSessionDetailQueryKey } from '../hooks/queryKeys';
import { fetchExerciseEntry } from '../services/api/exerciseStatsApi';

interface Vo2EstimateForEntryProps {
  exerciseEntryId: string;
  /** Only a run feeds the estimated VO2 max; the caller decides that. */
  isRun: boolean;
}

/**
 * The "use in VO2 max estimate" switch for a cardio session opened from the
 * stats lists, which carry no copy of the entry's setting. Reads the entry
 * under the same key as the shoe picker and the cardio detail hook, so it is
 * one request, and writes the new choice back into that cache.
 */
const Vo2EstimateForEntry: React.FC<Vo2EstimateForEntryProps> = ({
  exerciseEntryId,
  isRun,
}) => {
  const queryClient = useQueryClient();
  const queryKey = cardioSessionDetailQueryKey('entry', exerciseEntryId);
  const entryQuery = useQuery({
    queryKey,
    queryFn: () => fetchExerciseEntry(exerciseEntryId),
    enabled: isRun,
  });

  if (!isRun || !entryQuery.data) return null;
  return (
    <Vo2EstimateCard
      exerciseEntryId={exerciseEntryId}
      excluded={entryQuery.data.exclude_from_vo2_estimate === true}
      onChanged={(excluded) =>
        queryClient.setQueryData<ExerciseEntryResponse>(queryKey, (old) =>
          old ? { ...old, exclude_from_vo2_estimate: excluded } : old
        )
      }
    />
  );
};

export default Vo2EstimateForEntry;
