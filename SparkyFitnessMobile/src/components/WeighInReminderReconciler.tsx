import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { reconcileWeighInReminders } from '../services/weighInReminderService';
import { fetchMeasurements } from '../services/api/measurementsApi';
import { measurementsQueryKey } from '../hooks/queryKeys';
import { useLanguageRevision } from '../hooks/useLanguageRevision';
import { getTodayDate } from '../utils/dateUtils';

/**
 * Keeps scheduled weigh-in reminders matching the preferences, and leaves
 * today's out once a weight is logged for today (by hand or synced from
 * Health). Reads the same `measurementsQueryKey(today)` cache that check-in
 * saves and health syncs invalidate, so either re-runs it.
 */
const WeighInReminderReconciler: React.FC = () => {
  const enabled = useAppPreferencesStore((s) => s.weighInRemindersEnabled);
  const time = useAppPreferencesStore((s) => s.weighInReminderTime);
  const weekdays = useAppPreferencesStore((s) => s.weighInReminderWeekdays);
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const languageRevision = useLanguageRevision();
  const active = enabled && notificationsEnabled;
  const [today, setToday] = useState(getTodayDate);

  const { data, isError, isPending, refetch } = useQuery({
    queryKey: measurementsQueryKey(today),
    queryFn: () => fetchMeasurements(today),
    enabled: active,
  });

  // Unknown (offline, no server, still loading) schedules today as usual.
  const weightLoggedToday: boolean | null =
    !active || isPending || isError ? null : data?.weight != null;
  const weekdaysKey = weekdays.join(',');

  useEffect(() => {
    // While loading, wait for the answer instead of scheduling twice.
    if (active && isPending) return;
    void reconcileWeighInReminders(weightLoggedToday);
  }, [
    active,
    isPending,
    weightLoggedToday,
    time,
    weekdaysKey,
    today,
    languageRevision,
  ]);

  // Coming back to the app rolls the window forward (a new day) and picks up
  // a weight logged elsewhere (web, a scale's own app).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setToday(getTodayDate());
      if (active) void refetch();
    });
    return () => subscription.remove();
  }, [active, refetch]);

  return null;
};

export default WeighInReminderReconciler;
