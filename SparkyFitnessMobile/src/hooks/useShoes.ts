import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateShoeBody,
  ShoeStatus,
  UpdateShoeBody,
} from '@workspace/shared';
import {
  assignShoeToExerciseEntry,
  createShoe,
  deleteShoe,
  fetchShoes,
  updateShoe,
} from '../services/api/shoesApi';
import { exerciseStatsQueryKeyRoot, shoesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useShoes(status?: ShoeStatus) {
  const query = useQuery({
    queryKey: [...shoesQueryKey, status ?? 'all'],
    queryFn: () => fetchShoes(status),
  });

  useRefetchOnFocus(query.refetch);

  return {
    shoes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useShoeMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...shoesQueryKey] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateShoeBody) => createShoe(data),
    onSuccess: refresh,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShoeBody }) =>
      updateShoe(id, data),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShoe(id),
    onSuccess: () => {
      refresh();
      // Entries keep their data but lose the link.
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}

export function useAssignShoe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseEntryId,
      shoeId,
    }: {
      exerciseEntryId: string;
      shoeId: string | null;
    }) => assignShoeToExerciseEntry(exerciseEntryId, shoeId),
    onSuccess: () => {
      // Mileage is derived from the linked entries.
      void queryClient.invalidateQueries({ queryKey: [...shoesQueryKey] });
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...exerciseStatsQueryKeyRoot],
      });
    },
  });
}
