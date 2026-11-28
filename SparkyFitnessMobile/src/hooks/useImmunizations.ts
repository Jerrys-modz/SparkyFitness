import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateImmunizationBody,
  ImportImmunizationsBody,
  UpdateImmunizationBody,
} from '@workspace/shared';
import {
  createImmunization,
  deleteImmunization,
  fetchImmunizations,
  importImmunizations,
  scanImmunizations,
  updateImmunization,
} from '../services/api/immunizationsApi';
import { immunizationsQueryKey } from './queryKeys';
import { ApiError } from '../services/api/errors';
import { addLog } from '../services/LogService';

// The error message can carry the server's response, which may quote the record,
// so the log gets a fixed sentence and at most the HTTP status.
const failureLog = (what: string, err: Error) =>
  `Failed to ${what}${err instanceof ApiError ? ` (HTTP ${err.statusCode})` : ''}`;

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

/** Reads a vaccine record; the vaccines come back for review and nothing is saved. */
export function useScanImmunizations() {
  return useMutation({
    mutationFn: ({
      document,
      mimeType,
    }: {
      document: string;
      mimeType: string;
    }) => scanImmunizations(document, mimeType),
    onError: (err: Error) => {
      addLog(failureLog('scan immunizations', err), 'ERROR');
    },
  });
}

/** Saves the reviewed vaccines of one scan; all or none, so a failure can be retried. */
export function useImportImmunizations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportImmunizationsBody) => importImmunizations(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: immunizationsQueryKey }),
    onError: (err: Error) => {
      addLog(failureLog('import immunizations', err), 'ERROR');
    },
  });
}
