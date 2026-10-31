import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppLocale } from '../localization';
import {
  cancelScheduledNotification,
  scheduleMealReminderNotifications,
} from '../services/notifications';
import { addLog } from '../services/LogService';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  computeMealReminderSchedule,
  type MealReminder,
} from '../utils/mealReminders';

// Same single-owner shape as the hydration reconciler: one headless component
// (`MealReminderReconciler`) drives this, the scheduled chain is persisted so
// an unchanged input never reschedules, and every operation goes through one
// promise queue so a food log and an app resume cannot interleave two passes.
const MEAL_REMINDER_STORAGE_KEY = '@SparkyFitness/mealReminderSchedule';

interface StoredMealReminderSchedule {
  signature: string;
  notificationIds: string[];
}

export interface MealReminderReconcileInput {
  today: string;
  reminders: readonly MealReminder[];
  loggedMealTypeIds: readonly string[];
  /** Meal type id to display name, resolved by the caller. */
  mealNames: Readonly<Record<string, string>>;
  language?: string | null;
}

let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Meal reminder task failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

function signatureOf(input: MealReminderReconcileInput): string {
  return JSON.stringify([
    input.today,
    input.reminders.map((r) => [r.mealTypeId, r.time]),
    [...input.loggedMealTypeIds].sort(),
    input.reminders.map((r) => input.mealNames[r.mealTypeId] ?? null),
    input.language ?? null,
  ]);
}

async function readStoredSchedule(): Promise<StoredMealReminderSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(MEAL_REMINDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMealReminderSchedule>;
    if (
      typeof parsed.signature === 'string' &&
      Array.isArray(parsed.notificationIds) &&
      parsed.notificationIds.every((id) => typeof id === 'string')
    ) {
      return {
        signature: parsed.signature,
        notificationIds: parsed.notificationIds,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearStoredSchedule(
  stored: StoredMealReminderSchedule
): Promise<void> {
  await Promise.all(
    stored.notificationIds.map((id) => cancelScheduledNotification(id))
  );
  await AsyncStorage.removeItem(MEAL_REMINDER_STORAGE_KEY);
}

/**
 * Keeps the pending meal reminders in step with the meals logged today.
 * Idempotent for an unchanged input; any change cancels the old chain first.
 * An empty scheduling result (no permission, nothing due) is not persisted, so
 * the next reconcile tries again.
 */
export function reconcileMealReminders(
  input: MealReminderReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return enqueue(async () => {
    const signature = signatureOf(input);
    const stored = await readStoredSchedule();
    if (stored?.signature === signature) return;
    if (stored) await clearStoredSchedule(stored);

    const schedule = computeMealReminderSchedule({
      reminders: input.reminders,
      loggedMealTypeIds: new Set(input.loggedMealTypeIds),
      now,
    });
    const notificationIds = await scheduleMealReminderNotifications(
      schedule.map(({ mealTypeId, date }) => ({
        mealTypeId,
        date,
        mealName: input.mealNames[mealTypeId] ?? '',
      }))
    );
    if (notificationIds.length === 0) return;

    try {
      await AsyncStorage.setItem(
        MEAL_REMINDER_STORAGE_KEY,
        JSON.stringify({ signature, notificationIds })
      );
    } catch (error) {
      // An unpersisted chain could never be cancelled, including by the
      // toggle-off path, so cancel it here and let the queue log the failure.
      await Promise.all(
        notificationIds.map((id) => cancelScheduledNotification(id))
      );
      throw error;
    }
  });
}

/** Cancels and forgets any scheduled meal reminders. */
export function cancelMealReminders(): Promise<void> {
  return enqueue(async () => {
    const stored = await readStoredSchedule();
    if (stored) await clearStoredSchedule(stored);
  });
}

export interface MealReminderReconcilerInput {
  today: string;
  loggedMealTypeIds: readonly string[];
  mealNames: Readonly<Record<string, string>>;
  isLoading: boolean;
  refetch: () => void;
}

/** Single-owner reconciler. Mount it once, in an always-present place. */
export function useMealReminderReconciler({
  today,
  loggedMealTypeIds,
  mealNames,
  isLoading,
  refetch,
}: MealReminderReconcilerInput): void {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.mealRemindersEnabled
  );
  const reminders = useAppPreferencesStore((s) => s.mealReminders);
  const appLocale = useAppLocale();

  // Primitive keys keep the effect from re-running on a new array or object
  // instance that holds the same values.
  const loggedKey = [...loggedMealTypeIds].sort().join('|');
  const namesKey = JSON.stringify(mealNames);

  useEffect(() => {
    if (!remindersActive) {
      void cancelMealReminders();
      return;
    }
    if (isLoading) return;
    void reconcileMealReminders({
      today,
      reminders,
      loggedMealTypeIds: loggedKey ? loggedKey.split('|') : [],
      mealNames: JSON.parse(namesKey) as Record<string, string>,
      language: appLocale,
    });
  }, [
    remindersActive,
    isLoading,
    today,
    reminders,
    loggedKey,
    namesKey,
    appLocale,
  ]);

  // On resume, refetch so a meal logged elsewhere or a day rollover is seen;
  // the fresh data then reconciles through the effect above.
  useEffect(() => {
    if (!remindersActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [remindersActive, refetch]);
}

/** Test-only helper: drops any queued reconcile work. */
export function __resetMealReminderStateForTests(): void {
  queue = Promise.resolve();
}
