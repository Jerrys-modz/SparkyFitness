import { navigationRef } from '../components/ActiveWorkoutBar';
import { WEIGH_IN_REMINDER_KIND } from '../utils/weighInReminder';
import { whenNavigationReady } from '../hooks/useQuickActions';
import { getTodayDate } from '../utils/dateUtils';
import { initReminderTapResponses } from './reminderTapHandler';

/**
 * Opens Check-In's measurements step on today, with the weight field focused,
 * when a weigh-in reminder is tapped (cold start included). Returns an
 * unsubscribe function.
 */
export function initWeighInNotificationResponses(): () => void {
  return initReminderTapResponses(WEIGH_IN_REMINDER_KIND, () =>
    whenNavigationReady(() =>
      navigationRef.navigate('MeasurementsAdd', {
        date: getTodayDate(),
        focusWeight: true,
      })
    )
  );
}
