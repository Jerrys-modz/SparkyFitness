import { useCallback } from 'react';
import { getExerciseStats } from '@/api/Exercises/exerciseService';
import type { ExerciseStatsResponse } from '@workspace/shared';

/**
 * Fetches last-session stats for a set of exercises in parallel, keyed by
 * exercise id. A single exercise's fetch failing resolves to `null` for
 * that id rather than rejecting the whole batch, so one bad lookup doesn't
 * block session-start progression suggestions for the rest of the workout.
 */
export function useFetchExerciseProgressionStats() {
  return useCallback(
    async (
      exerciseIds: string[],
      presetId?: number
    ): Promise<Map<string, ExerciseStatsResponse | null>> => {
      const results = await Promise.all(
        exerciseIds.map(async (exerciseId) => {
          try {
            const stats = await getExerciseStats(exerciseId, { presetId });
            return [exerciseId, stats] as const;
          } catch {
            return [exerciseId, null] as const;
          }
        })
      );
      return new Map(results);
    },
    []
  );
}
