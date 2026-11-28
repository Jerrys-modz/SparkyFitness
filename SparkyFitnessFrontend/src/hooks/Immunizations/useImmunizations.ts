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
  ImportImmunizationsBody,
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

/** Reads a vaccine record; the vaccines come back for review and nothing is saved. */
export const useScanImmunizations = () =>
  useMutation({
    mutationFn: ({
      document,
      mimeType,
    }: {
      document: string;
      mimeType: string;
    }) => immunizationApi.scanImmunizations(document, mimeType),
    // No toast: the import dialog shows a failure inline, and only for the
    // file it is still showing.
    meta: { silentError: true },
  });

export const useImportImmunizations = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportImmunizationsBody) =>
      immunizationApi.importImmunizations(body),
    onSuccess: () => invalidateImmunizations(queryClient),
    meta: {
      errorMessage: i18n.t(
        'immunizations.import.saveFailed',
        'Could not save the records. Nothing was saved.'
      ),
    },
  });
};
