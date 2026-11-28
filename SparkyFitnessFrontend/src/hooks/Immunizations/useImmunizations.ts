import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import i18n from 'i18next';
import * as immunizationApi from '@/api/Immunizations/immunizationsApi';
import { immunizationKeys } from '@/api/keys/immunizations';
import type {
  CreateImmunizationBody,
  UpdateImmunizationBody,
} from '@workspace/shared';

const invalidateImmunizations = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: immunizationKeys.all });

export const useImmunizations = () =>
  useQuery({
    queryKey: immunizationKeys.list(),
    queryFn: immunizationApi.listImmunizations,
  });

export const useSaveImmunization = () => {
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
        ? immunizationApi.updateImmunization(id, body as UpdateImmunizationBody)
        : immunizationApi.createImmunization(body as CreateImmunizationBody),
    onSuccess: () => invalidateImmunizations(queryClient),
    meta: {
      errorMessage: i18n.t(
        'immunizations.saveFailed',
        'Could not save the immunization'
      ),
    },
  });
};

export const useDeleteImmunization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => immunizationApi.deleteImmunization(id),
    onSuccess: () => invalidateImmunizations(queryClient),
    meta: {
      errorMessage: i18n.t(
        'immunizations.deleteFailed',
        'Could not delete the immunization'
      ),
    },
  });
};
