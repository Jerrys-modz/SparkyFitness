import { useEffect } from 'react';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  cancelMoodCheckinReminders,
  scheduleMoodCheckinReminders,
} from '../services/moodCheckinReminderService';
import { hasNotificationPermission } from '../services/notifications';
import { createReminderQueue } from '../services/reminderScheduling';
import { useLanguageRevision } from '../hooks/useLanguageRevision';

// Runs are serialized so a quick edit can't interleave its cancel/schedule
// with the previous run's and leave a stale reminder behind.
const enqueue = createReminderQueue('Mood check-in reminder sync failed');

/** Keeps scheduled mood check-in reminders matching the preferences. */
const MoodCheckinReminderReconciler: React.FC = () => {
  const checkinRemindersEnabled = useAppPreferencesStore(
    (s) => s.checkinRemindersEnabled
  );
  const checkinReminderTimes = useAppPreferencesStore(
    (s) => s.checkinReminderTimes
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const languageRevision = useLanguageRevision();
  const timesKey = checkinReminderTimes.join(',');

  useEffect(() => {
    const times = timesKey ? timesKey.split(',') : [];
    void enqueue(async () => {
      await cancelMoodCheckinReminders();
      if (
        notificationsEnabled &&
        checkinRemindersEnabled &&
        (await hasNotificationPermission())
      ) {
        await scheduleMoodCheckinReminders(times);
      }
    });
  }, [
    checkinRemindersEnabled,
    timesKey,
    notificationsEnabled,
    languageRevision,
  ]);

  return null;
};

export default MoodCheckinReminderReconciler;
