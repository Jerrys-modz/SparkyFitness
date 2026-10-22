import { useServerConnection } from '../hooks/useServerConnection';
import { useCoachingCheckIn } from '../hooks/useCoachingCheckIn';
import { useCoachingReminderReconciler } from '../hooks/useCoachingReminder';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * Headless owner of the weekly check-in notification: renders nothing. Queries
 * stay disabled while the reminder is off or the server is unreachable, but the
 * hook still runs so turning the reminder off cancels what was scheduled.
 */
const CoachingReminderReconciler: React.FC = () => {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.coachingReminderEnabled
  );
  const { isConnected } = useServerConnection();
  const { checkIn } = useCoachingCheckIn(remindersActive && isConnected);

  useCoachingReminderReconciler({
    weekday: checkIn ? checkIn.settings.checkInWeekday : null,
    ready: checkIn ? checkIn.dataQuality.ready : false,
  });

  return null;
};

export default CoachingReminderReconciler;
