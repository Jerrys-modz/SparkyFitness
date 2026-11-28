import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateImmunizationBody,
  UpdateImmunizationBody,
} from '@workspace/shared';
import {
  createImmunization,
  deleteImmunization,
  fetchImmunizations,
  updateImmunization,
} from '../services/api/immunizationsApi';
import { immunizationsQueryKey } from './queryKeys';

export function useImmunizations() {
  return useQuery({
    queryKey: immunizationsQueryKey,
    queryFn: fetchImmunizations,
  });
}

export function useSaveImmunization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id?: string;
      body: CreateImmunizationBody | UpdateImmunizationBody;
    }) =>
      id
        ? updateImmunization(id, body as UpdateImmunizationBody)
        : createImmunization(body as CreateImmunizationBody),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: immunizationsQueryKey }),
  });
}

export function useDeleteImmunization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteImmunization(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: immunizationsQueryKey }),
  });
}
