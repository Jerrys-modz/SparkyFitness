import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppLocale } from '../localization';
import { scheduleMealReminderNotifications } from '../services/notifications';
import { createReminderChain } from '../services/reminderChain';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  computeMealReminderSchedule,
  type MealReminder,
} from '../utils/mealReminders';

// Same single-owner shape as the hydration reconciler: one headless component
// (`MealReminderReconciler`) drives this, and the scheduled set is persisted by
// the shared chain so an unchanged input never reschedules.
const chain = createReminderChain(
  '@SparkyFitness/mealReminderSchedule',
  'Meal reminder'
);

export interface MealReminderReconcileInput {
  today: string;
  reminders: readonly MealReminder[];
  loggedMealTypeIds: readonly string[];
  /** Meal type id to display name, resolved by the caller. */
  mealNames: Readonly<Record<string, string>>;
  language?: string | null;
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

/** Keeps the pending meal reminders in step with the meals logged today. */
export function reconcileMealReminders(
  input: MealReminderReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return chain.reconcile(signatureOf(input), () => {
    const schedule = computeMealReminderSchedule({
      reminders: input.reminders,
      loggedMealTypeIds: new Set(input.loggedMealTypeIds),
      now,
    });
    return scheduleMealReminderNotifications(
      schedule.map(({ mealTypeId, date }) => ({
        mealTypeId,
        date,
        mealName: input.mealNames[mealTypeId] ?? '',
      }))
    );
  });
}

/** Cancels and forgets any scheduled meal reminders. */
export function cancelMealReminders(): Promise<void> {
  return chain.cancel();
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
  chain.resetForTests();
}
