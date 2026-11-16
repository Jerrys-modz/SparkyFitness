import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';

/**
 * Runs `open` when a reminder of `kind` is tapped (the notification body, not
 * an action button), including the tap that launched the app from a closed
 * state. Returns an unsubscribe function.
 */
export function initReminderTapResponses(
  kind: string,
  open: (response: Notifications.NotificationResponse) => void
): () => void {
  // On Android the launch tap can arrive through both the listener and
  // getLastNotificationResponse(); remember the last one so it opens once.
  let lastHandledKey: string | null = null;

  const openIfTapped = (
    response: Notifications.NotificationResponse
  ): boolean => {
    if (
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
      response.notification.request.content.data?.kind !== kind
    ) {
      return false;
    }
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (key !== lastHandledKey) {
      lastHandledKey = key;
      open(response);
    }
    return true;
  };

  const subscription = addNotificationResponseListener(openIfTapped);

  const last = Notifications.getLastNotificationResponse();
  if (last && openIfTapped(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
