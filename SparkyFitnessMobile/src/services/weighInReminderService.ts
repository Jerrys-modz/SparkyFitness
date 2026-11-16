import * as Notifications from 'expo-notifications';

import {
  ensureWeighInChannel,
  hasNotificationPermission,
  notificationCopy,
  WEIGH_IN_CHANNEL_ID,
} from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import {
  computeWeighInReminderSlots,
  WEIGH_IN_REMINDER_KIND,
  WEIGH_IN_REMINDER_LOOKAHEAD_DAYS,
} from '../utils/weighInReminder';
import { addLog } from './LogService';
import {
  cancelNotificationIds,
  cancelRemindersOfKind,
  createReminderQueue,
} from './reminderScheduling';

function reminderIdentifier(offset: number): string {
  return `weigh_in_${offset}`;
}

const KNOWN_IDS = Array.from(
  { length: WEIGH_IN_REMINDER_LOOKAHEAD_DAYS },
  (_, offset) => reminderIdentifier(offset)
);

/** Cancels every scheduled weigh-in reminder, however it was identified. */
export async function cancelWeighInReminders(): Promise<void> {
  await cancelRemindersOfKind(
    WEIGH_IN_REMINDER_KIND,
    KNOWN_IDS,
    'cancelWeighInReminders'
  );
}

/** Clears weigh-in reminders already shown for `day` from the tray. */
async function dismissPresentedWeighInReminders(day: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(
          (n) =>
            n.request.content.data?.kind === WEIGH_IN_REMINDER_KIND &&
            n.request.content.data?.day === day
        )
        .map((n) =>
          Notifications.dismissNotificationAsync(n.request.identifier).catch(
            () => undefined
          )
        )
    );
  } catch (err) {
    addLog(
      `dismissPresentedWeighInReminders failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
}

/**
 * Schedules one-shot weigh-in reminders for the selected weekdays over the
 * lookahead window and returns their ids. `skipDay` (today, once a weight is
 * logged) gets none. All or nothing: on a failure what was scheduled is
 * cancelled and `[]` is returned. Never prompts for permission.
 */
export async function scheduleWeighInReminders({
  time,
  weekdays,
  skipDay,
  now = new Date(),
  today = getTodayDate(),
}: {
  time: string;
  weekdays: readonly number[];
  skipDay: string | null;
  now?: Date;
  today?: string;
}): Promise<string[]> {
  const ids: string[] = [];
  try {
    await ensureWeighInChannel();
    const slots = computeWeighInReminderSlots({
      now,
      today,
      time,
      weekdays,
      skipDay,
    });
    for (const slot of slots) {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(slot.offset),
        content: {
          // Neutral wording: an invitation, never a judgement (#2215).
          title: notificationCopy('notifications.weighIn.title', 'Weigh-in'),
          body: notificationCopy(
            'notifications.weighIn.body',
            "Log today's weight when it suits you. It's fine to skip a day."
          ),
          sound: true,
          data: { kind: WEIGH_IN_REMINDER_KIND, day: slot.day },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slot.at,
          channelId: WEIGH_IN_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
    return ids;
  } catch (err) {
    addLog(
      `scheduleWeighInReminders failed: ${(err as Error).message}`,
      'ERROR'
    );
    await cancelNotificationIds(ids);
    return [];
  }
}

// The reconciler and background sync both reconcile; one at a time.
const enqueue = createReminderQueue('Weigh-in reminder sync failed');

/**
 * Brings the scheduled weigh-in reminders in line with the preferences.
 * `weightLoggedToday` true leaves today out and clears today's delivered
 * reminder; `null` (not known, e.g. offline) schedules today as usual.
 */
export function reconcileWeighInReminders(
  weightLoggedToday: boolean | null
): Promise<void> {
  return enqueue(async () => {
    const prefs = useAppPreferencesStore.getState();
    const today = getTodayDate();
    await cancelWeighInReminders();
    if (weightLoggedToday) await dismissPresentedWeighInReminders(today);
    if (
      !prefs.notificationsEnabled ||
      !prefs.weighInRemindersEnabled ||
      !(await hasNotificationPermission())
    ) {
      return;
    }
    await scheduleWeighInReminders({
      time: prefs.weighInReminderTime,
      weekdays: prefs.weighInReminderWeekdays,
      skipDay: weightLoggedToday ? today : null,
      today,
    });
  });
}
