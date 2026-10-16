import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomCategory,
  deleteCustomMeasurement,
  fetchCustomEntriesForCategory,
  saveCustomMeasurement,
} from '../services/api/measurementsApi';
import {
  customCategoriesQueryKey,
  labHistoryQueryKey,
  latestManualCustomEntriesRootQueryKey,
} from './queryKeys';
import {
  useCustomCategories,
  useLatestManualCustomEntriesOnOrBefore,
} from './useCustomMeasurements';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { addLog } from '../services/LogService';
import { getTodayDate } from '../utils/dateUtils';
import {
  LAB_CATEGORY_FREQUENCY,
  isLabCategory,
  type LabCategory,
  type NewLabMarker,
} from '../utils/labResults';

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

export interface SaveLabResultInput {
  /** An existing marker's id, or a new marker to create first. */
  target: { categoryId: string } | { newMarker: NewLabMarker };
  value: number;
  /** Draw date, `YYYY-MM-DD`. */
  date: string;
  notes?: string;
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
    mutationFn: async (input: SaveLabResultInput) => {
      let categoryId: string;
      if ('categoryId' in input.target) {
        categoryId = input.target.categoryId;
      } else {
        const { newMarker } = input.target;
        const created = await createCustomCategory({
          name: newMarker.name,
          display_name: newMarker.display_name,
          measurement_type: newMarker.measurement_type,
          frequency: LAB_CATEGORY_FREQUENCY,
          data_type: 'numeric',
          is_lab: true,
          ref_range_low: newMarker.ref_range_low,
          ref_range_high: newMarker.ref_range_high,
        });
        categoryId = created.id;
      }
      const entry = await saveCustomMeasurement({
        category_id: categoryId,
        value: input.value,
        entry_date: input.date,
        notes: input.notes?.trim() || undefined,
        source: 'manual',
      });
      return { categoryId, entry };
    },
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
