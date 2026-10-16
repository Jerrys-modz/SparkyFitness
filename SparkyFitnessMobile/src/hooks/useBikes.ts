import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  BikeStatus,
  CreateBikeBody,
  CreateBikeComponentBody,
  ReplaceBikeComponentBody,
  RetireBikeComponentBody,
  UpdateBikeBody,
  UpdateBikeComponentBody,
} from '@workspace/shared';
import {
  assignBikeToExerciseEntry,
  createBike,
  createBikeComponent,
  deleteBike,
  deleteBikeComponent,
  fetchBike,
  fetchBikes,
  replaceBikeComponent,
  retireBikeComponent,
  updateBike,
  updateBikeComponent,
} from '../services/api/bikesApi';
import { addLog } from '../services/LogService';
import { bikesQueryKey, exerciseStatsQueryKeyRoot } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useBikes(status?: BikeStatus) {
  const query = useQuery({
    queryKey: [...bikesQueryKey, 'list', status ?? 'all'],
    queryFn: () => fetchBikes(status),
  });

  useRefetchOnFocus(query.refetch);

  return {
    bikes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** One bike with its components (active first, then retired history). */
export function useBike(bikeId: string | undefined) {
  const query = useQuery({
    queryKey: [...bikesQueryKey, 'detail', bikeId],
    queryFn: () => fetchBike(bikeId as string),
    enabled: bikeId !== undefined,
  });

  useRefetchOnFocus(query.refetch);

  return {
    bike: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useBikeMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...bikesQueryKey] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateBikeBody) => createBike(data),
    onSuccess: refresh,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBikeBody }) =>
      updateBike(id, data),
    onSuccess: refresh,
    // Shared by every caller (save, retire, reactivate), so none of them needs
    // its own failure feedback.
    onError: (error) => {
      addLog('Failed to update bike', 'ERROR', [String(error)]);
      Toast.show({
        type: 'error',
        text1: t('bikes.updateFailed', {
          defaultValue: 'Failed to update bike',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBike(id),
    onSuccess: () => {
      refresh();
      // Entries keep their data but lose the link.
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...exerciseStatsQueryKeyRoot],
      });
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}

export function useBikeComponentMutations(bikeId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...bikesQueryKey] });
  };
  const onError = (error: unknown) => {
    addLog('Failed to change bike component', 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: t('bikes.componentFailed', {
        defaultValue: 'Failed to update component',
      }),
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateBikeComponentBody) =>
      createBikeComponent(bikeId, data),
    onSuccess: refresh,
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBikeComponentBody }) =>
      updateBikeComponent(bikeId, id, data),
    onSuccess: refresh,
    onError,
  });

  const retireMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RetireBikeComponentBody }) =>
      retireBikeComponent(bikeId, id, data),
    onSuccess: refresh,
    onError,
  });

  const replaceMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ReplaceBikeComponentBody;
    }) => replaceBikeComponent(bikeId, id, data),
    onSuccess: refresh,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBikeComponent(bikeId, id),
    onSuccess: refresh,
    onError,
  });

  return {
    createMutation,
    updateMutation,
    retireMutation,
    replaceMutation,
    deleteMutation,
  };
}

export function useAssignBike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseEntryId,
      bikeId,
    }: {
      exerciseEntryId: string;
      bikeId: string | null;
    }) => assignBikeToExerciseEntry(exerciseEntryId, bikeId),
    onSuccess: () => {
      // Distance, time and component wear are derived from the linked entries.
      void queryClient.invalidateQueries({ queryKey: [...bikesQueryKey] });
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...exerciseStatsQueryKeyRoot],
      });
    },
  });
}
