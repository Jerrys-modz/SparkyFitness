import { useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  APPETITE_CATEGORY_SETTINGS,
  appetiteCategoryIds,
  appetiteMetricsFor,
  appetiteValuesForDay,
  type AppetiteCheckInVariant,
  type AppetiteMetricKey,
} from '@workspace/shared';

import {
  createCustomCategory,
  saveCustomMeasurement,
} from '../services/api/measurementsApi';
import {
  appetiteTrendQueryKeyRoot,
  customCategoriesQueryKey,
  customMeasurementsByDateQueryKey,
  latestManualCustomEntriesRootQueryKey,
} from './queryKeys';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
} from './useCustomMeasurements';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import type { CustomCategory } from '../types/customMeasurements';

export type AppetiteValues = Record<AppetiteMetricKey, number>;

/**
 * The hunger, fullness and cravings check-in (`appetite`) and the GLP-1 daily
 * check-in (`glp1`, which adds energy). Both store their scores as the same
 * `GLP *` daily custom measurement categories the web uses
 * (`shared/src/utils/appetiteCheckIn.ts`), so there is one value per day
 * whichever card saved it. A category is created on first save when missing.
 *
 * `displayName` names a category created here, in the app language.
 */
export function useAppetiteCheckIn(
  date: string,
  variant: AppetiteCheckInVariant,
  displayName: (key: AppetiteMetricKey) => string
) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCustomCategories();
  const entriesQuery = useCustomMeasurementsByDate(date);

  const { values: loadedValues, hasSaved: hasSavedValues } = useMemo(
    () =>
      appetiteValuesForDay(categoriesQuery.data, entriesQuery.data, variant),
    [categoriesQuery.data, entriesQuery.data, variant]
  );

  // IDs created by a save that then failed. The categories query still has the
  // pre-save list until it refetches, and the server does not dedupe by name,
  // so a retry must reuse these instead of creating them again.
  const createdCategoryIds = useRef(new Map<string, string>());

  const save = useMutation({
    mutationFn: async (values: AppetiteValues) => {
      // Sequential on purpose: two parallel first saves could each create the
      // same category, and the server does not dedupe by name.
      const known = appetiteCategoryIds(
        queryClient.getQueryData<CustomCategory[]>(customCategoriesQueryKey)
      );
      for (const metric of appetiteMetricsFor(variant)) {
        let categoryId =
          createdCategoryIds.current.get(metric.categoryName) ??
          known[metric.key];
        if (!categoryId) {
          const created = await createCustomCategory({
            name: metric.categoryName,
            display_name: displayName(metric.key),
            ...APPETITE_CATEGORY_SETTINGS,
          });
          categoryId = String(created.id);
          createdCategoryIds.current.set(metric.categoryName, categoryId);
        }
        await saveCustomMeasurement({
          category_id: categoryId,
          value: String(values[metric.key]),
          entry_date: date,
          entry_hour: null,
          entry_timestamp: new Date().toISOString(),
          notes: '',
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customMeasurementsByDateQueryKey(date),
      });
      void queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesRootQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: appetiteTrendQueryKeyRoot,
      });
      refreshHealthSyncCache(queryClient);
    },
    // A failure partway through has already created categories. Invalidate
    // here, not only on success, so the next save sees them once the refetch
    // lands. The ref above covers the gap before that refetch returns.
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: customCategoriesQueryKey,
      });
    },
  });

  return {
    loadedValues,
    hasSavedValues,
    isLoading: categoriesQuery.isLoading || entriesQuery.isLoading,
    save,
  };
}
