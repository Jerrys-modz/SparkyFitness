import { useQuery } from '@tanstack/react-query';
import { fetchNutrientGoalPreferences } from '../services/api/nutrientGoalPreferencesApi';
import { nutrientGoalPreferencesQueryKey } from './queryKeys';

/**
 * Fetches the effective goal direction (minimum / maximum / target band) for
 * every predefined and custom nutrient.
 */
export function useNutrientGoalPreferences({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: nutrientGoalPreferencesQueryKey,
    queryFn: fetchNutrientGoalPreferences,
    enabled,
  });

  return {
    goalPreferences: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
