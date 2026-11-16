import * as Notifications from 'expo-notifications';

import {
  ensureWeighInChannel,
  hasNotificationPermission,
  notificationCopy,
  WEIGH_IN_CHANNEL_ID,
} from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate, toLocalDateString } from '../utils/dateUtils';
import {
  planWeighInReminders,
  WEIGH_IN_REMINDER_KIND,
  WEIGH_IN_SKIP_FALLBACK_WEEKS,
} from '../utils/weighInReminder';
import { addLog } from './LogService';
import {
  cancelNotificationIds,
  cancelRemindersOfKind,
  createReminderQueue,
} from './reminderScheduling';

/** Repeating reminder for one weekday (0 = Sunday). */
function weeklyIdentifier(weekday: number): string {
  return `weigh_in_weekly_${weekday}`;
}

/** One-shot reminder `week` weeks after a skipped day. */
function skipFallbackIdentifier(week: number): string {
  return `weigh_in_skip_${week}`;
}

const KNOWN_IDS = [
  ...Array.from({ length: 7 }, (_, weekday) => weeklyIdentifier(weekday)),
  ...Array.from({ length: WEIGH_IN_SKIP_FALLBACK_WEEKS }, (_, i) =>
    skipFallbackIdentifier(i + 1)
  ),
];

/** Cancels every scheduled weigh-in reminder, however it was identified. */
export async function cancelWeighInReminders(): Promise<void> {
  await cancelRemindersOfKind(
    WEIGH_IN_REMINDER_KIND,
    KNOWN_IDS,
    'cancelWeighInReminders'
  );
}

/** Clears weigh-in reminders delivered on `day` from the tray. */
async function dismissPresentedWeighInReminders(day: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(
          (n) =>
            n.request.content.data?.kind === WEIGH_IN_REMINDER_KIND &&
            toLocalDateString(new Date(n.date)) === day
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

function reminderContent(): Notifications.NotificationContentInput {
  return {
    // Neutral wording: an invitation, never a judgement (#2215).
    title: notificationCopy('notifications.weighIn.title', 'Weigh-in'),
    body: notificationCopy(
      'notifications.weighIn.body',
      "Log today's weight when it suits you. It's fine to skip a day."
    ),
    sound: true,
    data: { kind: WEIGH_IN_REMINDER_KIND },
  };
}

/**
 * Schedules a repeating weekly reminder per selected weekday and returns the
 * ids. With `skipToday`, today's weekday instead gets one-shot reminders on
 * that weekday of the following weeks (see `planWeighInReminders`). All or
 * nothing: on a failure what was scheduled is cancelled and `[]` is returned.
 * Never prompts for permission.
 */
export async function scheduleWeighInReminders({
  time,
  weekdays,
  skipToday,
  today = getTodayDate(),
}: {
  time: string;
  weekdays: readonly number[];
  skipToday: boolean;
  today?: string;
}): Promise<string[]> {
  const ids: string[] = [];
  try {
    await ensureWeighInChannel();
    const plan = planWeighInReminders({ today, time, weekdays, skipToday });
    for (const weekday of plan.weekly) {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          identifier: weeklyIdentifier(weekday),
          content: reminderContent(),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            // Expo counts weekdays from 1 = Sunday.
            weekday: weekday + 1,
            hour: plan.hour,
            minute: plan.minute,
            channelId: WEIGH_IN_CHANNEL_ID,
          },
        })
      );
    }
    for (const oneShot of plan.oneShots) {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          identifier: skipFallbackIdentifier(oneShot.week),
          content: reminderContent(),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: oneShot.at,
            channelId: WEIGH_IN_CHANNEL_ID,
          },
        })
      );
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
      skipToday: weightLoggedToday === true,
      today,
    });
  });
}
