import * as Notifications from 'expo-notifications';
import {
  ensureOralCareChannel,
  notificationCopy,
  ORAL_CARE_CHANNEL_ID,
} from './notifications';
import {
  MAX_ORAL_CARE_REMINDERS,
  normalizeOralCareReminderTimes,
  ORAL_CARE_REMINDER_KIND,
} from '../utils/checkinReminderTimes';
import { addLog } from './LogService';
import {
  cancelNotificationIds,
  cancelRemindersOfKind,
} from './reminderScheduling';

function reminderIdentifier(index: number): string {
  return `oral_care_${index}`;
}

/** Cancels every scheduled brushing reminder, however it was identified. */
export async function cancelOralCareReminders(): Promise<void> {
  const known = Array.from({ length: MAX_ORAL_CARE_REMINDERS }, (_, i) =>
    reminderIdentifier(i)
  );
  await cancelRemindersOfKind(
    ORAL_CARE_REMINDER_KIND,
    known,
    'cancelOralCareReminders'
  );
}

/**
 * Schedules one repeating daily brushing reminder per time and returns the ids.
 * All or nothing: on any failure what was scheduled is cancelled and `[]` is
 * returned. Never prompts for permission; callers gate on it.
 */
export async function scheduleOralCareReminders(
  times: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  try {
    await ensureOralCareChannel();
    for (const [index, time] of normalizeOralCareReminderTimes(
      times
    ).entries()) {
      const [hour, minute] = time.split(':').map(Number);
      const id = await Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(index),
        content: {
          title: notificationCopy(
            'notifications.oralCare.title',
            'Time to brush'
          ),
          body: notificationCopy(
            'notifications.oralCare.body',
            'Two minutes for your teeth, then log it.'
          ),
          sound: true,
          data: { kind: ORAL_CARE_REMINDER_KIND },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: ORAL_CARE_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
    return ids;
  } catch (err) {
    addLog(
      `scheduleOralCareReminders failed: ${(err as Error).message}`,
      'ERROR'
    );
    await cancelNotificationIds(ids);
    return [];
  }
}
