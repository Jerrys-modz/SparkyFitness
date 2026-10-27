import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';

import {
  addNotificationResponseListener,
  FUELING_LOG_ACTION,
  FUELING_REMINDER_KIND,
} from './notifications';
import { logFuelingPortion } from './fuelingLog';
import { addLog } from './LogService';
import i18n from '../localization/i18n';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it logs once.
let lastHandledKey: string | null = null;

function logIfActioned(response: Notifications.NotificationResponse): boolean {
  const content = response.notification.request.content;
  if (
    response.actionIdentifier !== FUELING_LOG_ACTION ||
    content.data?.kind !== FUELING_REMINDER_KIND
  ) {
    return false;
  }

  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key === lastHandledKey) return true;
  lastHandledKey = key;

  const portionGrams = Number(content.data?.portionGrams);
  const productName = String(content.data?.productName ?? '').trim();
  if (!Number.isFinite(portionGrams) || portionGrams <= 0 || !productName) {
    return true;
  }

  const servingSize = Number(content.data?.servingSize);
  const foodId = String(content.data?.foodId ?? '');
  const variantId = String(content.data?.variantId ?? '');
  const servingUnit = String(content.data?.servingUnit ?? '');
  const food =
    foodId && variantId && servingUnit && servingSize > 0
      ? { foodId, variantId, servingSize, servingUnit }
      : null;

  void logFuelingPortion({ productName, portionGrams, food })
    .then(() => {
      Toast.show({
        type: 'success',
        text1: i18n.t('fuelingPlan.logged', {
          defaultValue: 'Logged {{grams}} g of carbs.',
          grams: portionGrams,
        }),
      });
    })
    .catch((error: unknown) => {
      // Let the same notification be actioned again if the log did not land.
      lastHandledKey = null;
      addLog(`Logging a fueling portion failed: ${String(error)}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: i18n.t('fuelingPlan.logFailed', {
          defaultValue: 'Could not log the carbs. Add them to your diary.',
        }),
      });
    });
  return true;
}

/**
 * Logs the portion when a fueling reminder's Log it button is pressed,
 * including the press that launched the app from a closed state. A plain tap
 * only opens the app. Returns an unsubscribe function.
 */
export function initFuelingNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener(logIfActioned);

  const last = Notifications.getLastNotificationResponse();
  if (last && logIfActioned(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
