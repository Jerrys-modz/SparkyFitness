import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCustomMeasurement,
  fetchCustomEntriesForCategory,
} from '../services/api/measurementsApi';
import {
  deleteImportedLabResults,
  deleteLabMarker,
} from '../services/api/labReportApi';
import { saveLabResult } from '../services/labResultsService';
import {
  customCategoriesQueryKey,
  labHistoryQueryKey,
  labHistoryRootQueryKey,
  latestManualCustomEntriesRootQueryKey,
} from './queryKeys';
import {
  useCustomCategories,
  useLatestManualCustomEntriesOnOrBefore,
} from './useCustomMeasurements';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { addLog } from '../services/LogService';
import { getTodayDate } from '../utils/dateUtils';
import { isLabCategory, type LabCategory } from '../utils/labResults';

/** The user's lab markers, as flagged custom categories. */
export function useLabMarkers() {
  const query = useCustomCategories();
  const markers = useMemo<LabCategory[]>(
    () => (query.data ?? []).filter(isLabCategory),
    [query.data]
  );
  return { markers, ...query };
}

/** Newest manual value per category as of today, keyed by category id. */
export function useLatestLabValues() {
  const query = useLatestManualCustomEntriesOnOrBefore(getTodayDate());
  const byCategory = useMemo(
    () => new Map((query.data ?? []).map((row) => [row.category_id, row])),
    [query.data]
  );
  return { byCategory, ...query };
}

/** Every result for one marker, oldest first. */
export function useLabHistory(categoryId: string) {
  return useQuery({
    queryKey: labHistoryQueryKey(categoryId),
    queryFn: () => fetchCustomEntriesForCategory(categoryId),
    enabled: !!categoryId,
  });
}

function invalidateLabCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  categoryId: string
) {
  queryClient.invalidateQueries({ queryKey: customCategoriesQueryKey });
  queryClient.invalidateQueries({ queryKey: labHistoryQueryKey(categoryId) });
  queryClient.invalidateQueries({
    queryKey: latestManualCustomEntriesRootQueryKey,
  });
  refreshHealthSyncCache(queryClient);
}

export function useSaveLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveLabResult,
    onSuccess: ({ categoryId }) => invalidateLabCaches(queryClient, categoryId),
    onError: (err: Error) => {
      addLog(`Failed to save lab result: ${err.message}`, 'ERROR');
    },
  });
}

export function useDeleteLabResult(categoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => deleteCustomMeasurement(entryId),
    onSuccess: () => invalidateLabCaches(queryClient, categoryId),
    onError: (err: Error) => {
      addLog(`Failed to delete lab result: ${err.message}`, 'ERROR');
    },
  });
}

function invalidateAllLabCaches(
  queryClient: ReturnType<typeof useQueryClient>
) {
  queryClient.invalidateQueries({ queryKey: customCategoriesQueryKey });
  queryClient.invalidateQueries({ queryKey: labHistoryRootQueryKey });
  queryClient.invalidateQueries({
    queryKey: latestManualCustomEntriesRootQueryKey,
  });
  refreshHealthSyncCache(queryClient);
}

/** Deletes every result a report import saved, and the markers left empty. */
export function useDeleteImportedLabResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteImportedLabResults,
    onSettled: () => invalidateAllLabCaches(queryClient),
    onError: (err: Error) => {
      addLog(`Failed to delete imported lab results: ${err.message}`, 'ERROR');
    },
  });
}

/** Deletes one lab marker with all of its results. */
export function useDeleteLabMarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => deleteLabMarker(categoryId),
    onSettled: () => invalidateAllLabCaches(queryClient),
    onError: (err: Error) => {
      addLog(`Failed to delete lab marker: ${err.message}`, 'ERROR');
    },
  });
}
