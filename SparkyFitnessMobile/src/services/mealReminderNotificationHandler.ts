import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { MEAL_REMINDER_KIND } from '../utils/mealReminders';
import { whenNavigationReady } from '../hooks/useQuickActions';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it opens once.
let lastHandledKey: string | null = null;

function openFoodSearchIfTapped(
  response: Notifications.NotificationResponse
): boolean {
  const data = response.notification.request.content.data;
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
    data?.kind !== MEAL_REMINDER_KIND
  ) {
    return false;
  }
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key !== lastHandledKey) {
    lastHandledKey = key;
    const mealTypeId =
      typeof data.mealTypeId === 'string' ? data.mealTypeId : undefined;
    whenNavigationReady(() =>
      navigationRef.navigate('FoodSearch', { mealTypeId })
    );
  }
  return true;
}

/**
 * Opens Food Search for the reminded meal when a meal reminder is tapped,
 * including the tap that launched the app from a closed state. Returns an
 * unsubscribe function.
 */
export function initMealReminderNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener(openFoodSearchIfTapped);

  const last = Notifications.getLastNotificationResponse();
  if (last && openFoodSearchIfTapped(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
