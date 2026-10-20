import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { whenNavigationReady } from '../hooks/useQuickActions';

function openCheckinIfTapped(response: Notifications.NotificationResponse) {
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
    response.notification.request.content.data?.kind !== 'mood-checkin'
  ) {
    return;
  }
  whenNavigationReady(() => navigationRef.navigate('MoodLog'));
}

/**
 * Opens the mood check-in when a reminder is tapped, including the tap that
 * launched the app from a closed state. Returns an unsubscribe function.
 */
export function initMoodCheckinNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener(openCheckinIfTapped);

  const last = Notifications.getLastNotificationResponse();
  if (last) {
    openCheckinIfTapped(last);
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
