import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scanLabReport } from '../services/api/labReportApi';
import {
  saveLabResult,
  type SaveLabResultInput,
} from '../services/labResultsService';
import {
  customCategoriesQueryKey,
  labHistoryRootQueryKey,
  latestManualCustomEntriesRootQueryKey,
} from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
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

export interface ImportLabResultsOutcome {
  saved: number;
  failed: string[];
}

/**
 * Saves the reviewed results one at a time, so a marker is created before the
 * result that needs it, and one failure does not lose the rest.
 */
export function useImportLabResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      rows: { name: string; input: SaveLabResultInput }[]
    ): Promise<ImportLabResultsOutcome> => {
      const outcome: ImportLabResultsOutcome = { saved: 0, failed: [] };
      for (const row of rows) {
        try {
          await saveLabResult(row.input);
          outcome.saved += 1;
        } catch (error) {
          addLog(
            `Failed to import lab result ${row.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            'ERROR'
          );
          outcome.failed.push(row.name);
        }
      }
      return outcome;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: customCategoriesQueryKey });
      queryClient.invalidateQueries({ queryKey: labHistoryRootQueryKey });
      queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
  });
}
