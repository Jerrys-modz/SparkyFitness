import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  BikeStatus,
  CreateBikeBody,
  UpdateBikeBody,
} from '@workspace/shared';
import {
  assignBikeToEntry,
  createBike,
  deleteBike,
  fetchBikes,
  updateBike,
} from '@/api/Bikes/bikeService';
import { bikeKeys } from '@/api/keys/bikes';
import { exerciseEntryKeys } from '@/api/keys/exercises';

export const useBikes = (status?: BikeStatus) =>
  useQuery({
    queryKey: bikeKeys.list(status),
    queryFn: () => fetchBikes(status),
    meta: {
      errorMessage: i18n.t('bikes.failedToLoad', 'Failed to load bikes.'),
    },
  });

export const useCreateBikeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBikeBody) => createBike(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bikeKeys.all });
    },
    meta: {
      successMessage: i18n.t('bikes.added', 'Bike added.'),
      errorMessage: i18n.t('bikes.failedToSave', 'Failed to save bike.'),
    },
  });
};

export const useUpdateBikeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBikeBody }) =>
      updateBike(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bikeKeys.all });
    },
    meta: {
      successMessage: i18n.t('bikes.updated', 'Bike updated.'),
      errorMessage: i18n.t('bikes.failedToSave', 'Failed to save bike.'),
    },
  });
};

export const useDeleteBikeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBike(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bikeKeys.all });
      // Entries keep their data but lose the link, so refresh the diary too.
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    },
    meta: {
      successMessage: i18n.t('bikes.deleted', 'Bike deleted.'),
      errorMessage: i18n.t('bikes.failedToDelete', 'Failed to delete bike.'),
    },
  });
};

export const useAssignBikeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseEntryId,
      bikeId,
    }: {
      exerciseEntryId: string;
      bikeId: string | null;
    }) => assignBikeToEntry(exerciseEntryId, bikeId),
    onSuccess: () => {
      // Distance, time and component wear are derived from linked entries.
      queryClient.invalidateQueries({ queryKey: bikeKeys.all });
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'bikes.failedToAssign',
        'Failed to update the bike for this ride.'
      ),
    },
  });
};
