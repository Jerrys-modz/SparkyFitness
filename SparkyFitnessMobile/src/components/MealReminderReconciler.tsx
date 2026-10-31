import { useCallback, useMemo } from 'react';

import { useFoodEntriesRange } from '../hooks/useFoodEntriesRange';
import { useMealReminderReconciler } from '../hooks/useMealReminder';
import { useMealTypes } from '../hooks/useMealTypes';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';

/**
 * Headless owner of meal reminder reconciliation; renders nothing.
 *
 * Always reads today, not the Dashboard's selected date: a reminder is about
 * logging a meal now. Queries stay disabled while reminders are off or the
 * server is unreachable, but the hook still runs so turning reminders off
 * cancels what was scheduled.
 */
const MealReminderReconciler: React.FC = () => {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.mealRemindersEnabled
  );
  const { isConnected } = useServerConnection();
  const queriesEnabled = remindersActive && isConnected;
  const today = getTodayDate();

  const {
    data: entries,
    isLoading: entriesLoading,
    refetch: refetchEntries,
  } = useFoodEntriesRange({
    startDate: today,
    endDate: today,
    enabled: queriesEnabled,
  });
  const {
    mealTypes,
    isLoading: mealTypesLoading,
    refetch: refetchMealTypes,
  } = useMealTypes({ enabled: queriesEnabled });

  const loggedMealTypeIds = useMemo(
    () => [
      ...new Set(
        entries.flatMap((e) => (e.meal_type_id ? [e.meal_type_id] : []))
      ),
    ],
    [entries]
  );
  const mealNames = useMemo(
    () => Object.fromEntries(mealTypes.map((m) => [m.id, m.name])),
    [mealTypes]
  );

  const refetch = useCallback(() => {
    if (!queriesEnabled) return;
    void refetchEntries();
    void refetchMealTypes();
  }, [queriesEnabled, refetchEntries, refetchMealTypes]);

  useMealReminderReconciler({
    today,
    loggedMealTypeIds,
    mealNames,
    isLoading: entriesLoading || mealTypesLoading,
    refetch,
  });

  return null;
};

export default MealReminderReconciler;
