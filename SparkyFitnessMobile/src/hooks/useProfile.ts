import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, updateTargetBodyFat } from '../services/api/profileApi';
import { profileQueryKey } from './queryKeys';

export function useProfile() {
  const query = useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    staleTime: 1000 * 60 * 30, // 30 minutes - profile rarely changes
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Saves or clears the body fat goal, then refreshes the profile it is read from. */
export function useSetTargetBodyFat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetBodyFatPercentage: number | null) =>
      updateTargetBodyFat(targetBodyFatPercentage),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}
