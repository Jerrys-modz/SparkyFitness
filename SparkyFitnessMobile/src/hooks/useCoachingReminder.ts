import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppLocale } from '../localization';
import {
  cancelScheduledNotification,
  scheduleCoachingCheckInNotification,
} from '../services/notifications';
import { addLog } from '../services/LogService';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { nextCoachingReminderTime } from '../utils/coachingCheckIn';

// One local notification is kept scheduled for the next check-in day. It is
// rebuilt only when its inputs change, and every operation goes through one
// promise queue so two reconciles cannot each schedule one.
const COACHING_REMINDER_STORAGE_KEY = '@SparkyFitness/coachingReminder';

interface StoredCoachingReminder {
  signature: string;
  notificationId: string;
}

export interface CoachingReminderReconcileInput {
  weekday: number;
  language?: string | null;
}

let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Coaching reminder task failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

async function readStored(): Promise<StoredCoachingReminder | null> {
  try {
    const raw = await AsyncStorage.getItem(COACHING_REMINDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCoachingReminder>;
    if (
      typeof parsed.signature === 'string' &&
      typeof parsed.notificationId === 'string'
    ) {
      return {
        signature: parsed.signature,
        notificationId: parsed.notificationId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearStored(stored: StoredCoachingReminder): Promise<void> {
  await cancelScheduledNotification(stored.notificationId);
  await AsyncStorage.removeItem(COACHING_REMINDER_STORAGE_KEY);
}

/**
 * Keeps one notification scheduled for the next check-in day at 09:00. A fired
 * or past notification is replaced the next time the app reconciles, because the
 * target date is part of the signature. An unavailable schedule (no permission)
 * is not persisted, so the next reconcile tries again.
 */
export function reconcileCoachingReminder(
  input: CoachingReminderReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return enqueue(async () => {
    const time = nextCoachingReminderTime(now, input.weekday);
    const signature = JSON.stringify([time.getTime(), input.language ?? null]);
    const stored = await readStored();
    if (stored?.signature === signature) return;
    if (stored) await clearStored(stored);

    const notificationId = await scheduleCoachingCheckInNotification(time);
    if (notificationId === null) return;
    try {
      await AsyncStorage.setItem(
        COACHING_REMINDER_STORAGE_KEY,
        JSON.stringify({ signature, notificationId })
      );
    } catch (error) {
      // An unrecorded notification could never be cancelled, including by the
      // toggle-off path, so drop it and let the queue log the failure.
      await cancelScheduledNotification(notificationId);
      throw error;
    }
  });
}

/** Cancels and forgets the scheduled check-in notification. */
export function cancelCoachingReminder(): Promise<void> {
  return enqueue(async () => {
    const stored = await readStored();
    if (stored) await clearStored(stored);
  });
}

export interface CoachingReminderReconcilerInput {
  /** The person's check-in weekday; null while the check-in is not loaded. */
  weekday: number | null;
  /** Enough data for a check-in to say something. */
  ready: boolean;
}

/**
 * Single-owner reconciler; mount it once, in an always-present place. A
 * notification is only worth sending when the check-in has data to report.
 */
export function useCoachingReminderReconciler({
  weekday,
  ready,
}: CoachingReminderReconcilerInput): void {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.coachingReminderEnabled
  );
  const appLocale = useAppLocale();

  useEffect(() => {
    if (!remindersActive) {
      void cancelCoachingReminder();
      return;
    }
    if (weekday === null) return;
    if (!ready) {
      void cancelCoachingReminder();
      return;
    }
    void reconcileCoachingReminder({ weekday, language: appLocale });
  }, [remindersActive, weekday, ready, appLocale]);
}

/** Test-only helper — drops any queued reconcile work. */
export function __resetCoachingReminderStateForTests(): void {
  queue = Promise.resolve();
}
