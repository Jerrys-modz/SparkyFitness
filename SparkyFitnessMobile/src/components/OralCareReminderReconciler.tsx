import { useEffect } from 'react';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  cancelOralCareReminders,
  scheduleOralCareReminders,
} from '../services/oralCareReminderService';
import { hasNotificationPermission } from '../services/notifications';
import { createReminderQueue } from '../services/reminderScheduling';
import { useLanguageRevision } from '../hooks/useLanguageRevision';

// Runs are serialized so a quick edit can't interleave its cancel/schedule
// with the previous run's and leave a stale reminder behind.
const enqueue = createReminderQueue('Brushing reminder sync failed');

/** Keeps scheduled brushing reminders matching the preferences (#1862). */
const OralCareReminderReconciler: React.FC = () => {
  const enabled = useAppPreferencesStore((s) => s.oralCareRemindersEnabled);
  const times = useAppPreferencesStore((s) => s.oralCareReminderTimes);
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const languageRevision = useLanguageRevision();
  const timesKey = times.join(',');

  useEffect(() => {
    const list = timesKey ? timesKey.split(',') : [];
    void enqueue(async () => {
      await cancelOralCareReminders();
      if (
        notificationsEnabled &&
        enabled &&
        (await hasNotificationPermission())
      ) {
        await scheduleOralCareReminders(list);
      }
    });
  }, [enabled, timesKey, notificationsEnabled, languageRevision]);

  return null;
};

export default OralCareReminderReconciler;
