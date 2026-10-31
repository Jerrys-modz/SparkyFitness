import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportLabReportBody } from '@workspace/shared';
import { importLabReport, scanLabReport } from '../services/api/labReportApi';
import {
  labHistoryRootQueryKey,
  labLatestQueryKey,
  labMarkersQueryKey,
} from './queryKeys';
import { addLog } from '../services/LogService';

/** Reads a report; the results come back for review and nothing is saved. */
export function useScanLabReport() {
  return useMutation({
    mutationFn: ({
      document,
      mimeType,
    }: {
      document: string;
      mimeType: string;
    }) => scanLabReport(document, mimeType),
    onError: (err: Error) => {
      addLog(`Failed to scan lab report: ${err.message}`, 'ERROR');
    },
  });
}

/**
 * Saves the reviewed results as one report. It is all or nothing, so a failure
 * leaves nothing half saved and the review can simply be retried.
 */
export function useImportLabReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ImportLabReportBody) => importLabReport(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labMarkersQueryKey });
      queryClient.invalidateQueries({ queryKey: labLatestQueryKey });
      queryClient.invalidateQueries({ queryKey: labHistoryRootQueryKey });
    },
    onError: (err: Error) => {
      addLog(`Failed to import lab report: ${err.message}`, 'ERROR');
    },
  });
}
