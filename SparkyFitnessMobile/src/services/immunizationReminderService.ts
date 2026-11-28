import * as Notifications from 'expo-notifications';
import {
  ensureImmunizationChannel,
  IMMUNIZATION_CHANNEL_ID,
  notificationCopy,
} from './notifications';
import {
  IMMUNIZATION_REMINDER_KIND,
  immunizationReminderFireAt,
  type ImmunizationReminderPlanItem,
} from '../utils/immunizationReminders';
import { addLog } from './LogService';

/** Cancels every scheduled vaccine reminder, however it was identified. */
export async function cancelImmunizationReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content.data?.kind === IMMUNIZATION_REMINDER_KIND)
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier).catch(
            () => undefined
          )
        )
    );
  } catch (err) {
    addLog(
      `cancelImmunizationReminders failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/**
 * Schedules the planned reminders. A moment already past is skipped (a due-day
 * reminder planned after 9:00 that day), and a reminder that fails to schedule
 * is logged without stopping the rest. Never prompts for permission; callers
 * gate on it.
 */
export async function scheduleImmunizationReminders(
  plan: readonly ImmunizationReminderPlanItem[],
  now: Date = new Date()
): Promise<void> {
  try {
    await ensureImmunizationChannel();
  } catch (err) {
    addLog(
      `scheduleImmunizationReminders channel failed: ${(err as Error).message}`,
      'ERROR'
    );
    return;
  }
  for (const item of plan) {
    const date = immunizationReminderFireAt(item.day);
    if (date.getTime() <= now.getTime()) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: item.identifier,
        content: {
          title: notificationCopy(
            'notifications.immunization.title',
            'Vaccine due'
          ),
          body:
            item.when === 'due'
              ? notificationCopy(
                  'notifications.immunization.dueToday',
                  '{{name}} is due today.',
                  { name: item.vaccineName }
                )
              : notificationCopy(
                  'notifications.immunization.dueSoon',
                  '{{name}} is due in a week.',
                  { name: item.vaccineName }
                ),
          sound: true,
          data: { kind: IMMUNIZATION_REMINDER_KIND, recordId: item.recordId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: IMMUNIZATION_CHANNEL_ID,
        },
      });
    } catch (err) {
      addLog(
        `scheduleImmunizationReminders failed: ${(err as Error).message}`,
        'ERROR'
      );
    }
  }
}
