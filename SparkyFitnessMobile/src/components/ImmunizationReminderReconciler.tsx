import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useCalendars } from 'expo-localization';

import { useImmunizations } from '../hooks/useImmunizations';
import { useMobileFeatures } from '../hooks/useMobileFeatures';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  cancelImmunizationReminders,
  scheduleImmunizationReminders,
} from '../services/immunizationReminderService';
import { hasNotificationPermission } from '../services/notifications';
import { planImmunizationReminders } from '../utils/immunizationReminders';
import { getTodayDate } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import { accountGeneration } from '../offline/accountGeneration';
import { subscribeAccountChanged } from '../offline/events';
import i18n from '../localization/i18n';

let queue: Promise<void> = Promise.resolve();

// Runs are serialized so a quick change can't interleave its cancel/schedule
// with the previous run's and leave a stale reminder behind.
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Vaccine reminder sync failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

/**
 * Keeps the scheduled vaccine reminders matching the person's records
 * (#2765): one a week before each next-due date and one on the day.
 *
 * They stop while Immunizations is turned off on purpose in Settings →
 * Features, the reminder switch is off, notifications are off, or there is no
 * server; they are left exactly as they are while the records are not known
 * (loading, offline), so nothing that was set disappears on a bad connection.
 */
const ImmunizationReminderReconciler: React.FC = () => {
  const remindersEnabled = useAppPreferencesStore(
    (s) => s.immunizationRemindersEnabled
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const { isExplicitlyOff } = useMobileFeatures();
  const featureOff = isExplicitlyOff('immunizations');
  const { activeConfigId, isLoading: isLoadingServer } = useServerConfigs();
  const noActiveServer = !isLoadingServer && activeConfigId === null;
  const active = !featureOff && remindersEnabled && notificationsEnabled;

  const [languageRevision, setLanguageRevision] = useState(0);
  const [, bumpResumeRevision] = useReducer((n: number) => n + 1, 0);
  // Read through a hook, never by calling accountGeneration() in the body:
  // React Compiler memoizes such a call once per mounted component.
  const readUnderAccount = useSyncExternalStore(
    subscribeAccountChanged,
    accountGeneration
  );

  // Re-renders on a time change on iOS; the foreground listener below covers
  // Android and an app left open across midnight.
  useCalendars();
  const today = getTodayDate();

  const { data: records } = useImmunizations({
    enabled: active && !noActiveServer,
  });

  useEffect(() => {
    void enqueue(async () => {
      if (!active || noActiveServer) {
        await cancelImmunizationReminders();
        return;
      }
      // Records not known yet: keep what is scheduled.
      if (!records) return;
      await cancelImmunizationReminders();
      if (await hasNotificationPermission()) {
        await scheduleImmunizationReminders(
          planImmunizationReminders(records, today)
        );
      }
    });
  }, [
    active,
    noActiveServer,
    records,
    today,
    languageRevision,
    readUnderAccount,
  ]);

  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') bumpResumeRevision();
    });
    return () => subscription.remove();
  }, []);

  return null;
};

export default ImmunizationReminderReconciler;
