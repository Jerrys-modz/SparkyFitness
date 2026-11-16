import { navigationRef } from '../components/ActiveWorkoutBar';
import { MOOD_CHECKIN_KIND } from '../utils/checkinReminderTimes';
import { whenNavigationReady } from '../hooks/useQuickActions';
import { initReminderTapResponses } from './reminderTapHandler';

/**
 * Opens the mood check-in when a reminder is tapped, including the tap that
 * launched the app from a closed state. Returns an unsubscribe function.
 */
export function initMoodCheckinNotificationResponses(): () => void {
  return initReminderTapResponses(MOOD_CHECKIN_KIND, () =>
    whenNavigationReady(() => navigationRef.navigate('MoodLog'))
  );
}
