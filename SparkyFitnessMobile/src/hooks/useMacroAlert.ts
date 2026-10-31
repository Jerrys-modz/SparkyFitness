import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppLocale } from '../localization';
import { scheduleMacroAlertNotifications } from '../services/notifications';
import { createReminderChain } from '../services/reminderChain';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  computeMacroAlerts,
  type MacroAlertRule,
  type MacroTotals,
} from '../utils/macroAlerts';

const chain = createReminderChain(
  '@SparkyFitness/macroAlertSchedule',
  'Macro alert'
);

export interface MacroAlertReconcileInput {
  today: string;
  rules: readonly MacroAlertRule[];
  totals: MacroTotals;
  /** Macro key to display name, resolved by the caller. */
  macroNames: Readonly<Record<string, string>>;
  language?: string | null;
}

function signatureOf(input: MacroAlertReconcileInput, now: Date): string {
  // Alerts are only scheduled while their time is ahead, so the set of due
  // rules is part of the identity; totals are rounded to what the text shows.
  const due = computeMacroAlerts({
    rules: input.rules,
    totals: input.totals,
    now,
  });
  return JSON.stringify([
    input.today,
    due.map((a) => [
      a.macro,
      a.percent,
      a.date.getTime(),
      a.remaining,
      a.progressPercent,
    ]),
    due.map((a) => input.macroNames[a.macro] ?? null),
    input.language ?? null,
  ]);
}

/**
 * Keeps the pending macro alerts in step with today's totals: an alert exists
 * only while its time is ahead and you are still under its share of the
 * target, so logging enough food cancels it.
 */
export function reconcileMacroAlerts(
  input: MacroAlertReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return chain.reconcile(signatureOf(input, now), () =>
    scheduleMacroAlertNotifications(
      computeMacroAlerts({
        rules: input.rules,
        totals: input.totals,
        now,
      }).map((alert) => ({
        ...alert,
        macroName: input.macroNames[alert.macro] ?? alert.macro,
      }))
    )
  );
}

/** Cancels and forgets any scheduled macro alerts. */
export function cancelMacroAlerts(): Promise<void> {
  return chain.cancel();
}

export interface MacroAlertReconcilerInput {
  today: string;
  totals: MacroTotals;
  macroNames: Readonly<Record<string, string>>;
  isLoading: boolean;
  refetch: () => void;
}

/** Single-owner reconciler. Mount it once, in an always-present place. */
export function useMacroAlertReconciler({
  today,
  totals,
  macroNames,
  isLoading,
  refetch,
}: MacroAlertReconcilerInput): void {
  const alertsActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.macroAlertsEnabled
  );
  const rules = useAppPreferencesStore((s) => s.macroAlertRules);
  const appLocale = useAppLocale();

  // Primitive keys keep the effect from re-running on a new object that holds
  // the same values.
  const totalsKey = JSON.stringify(totals);
  const namesKey = JSON.stringify(macroNames);

  useEffect(() => {
    if (!alertsActive) {
      void cancelMacroAlerts();
      return;
    }
    if (isLoading) return;
    void reconcileMacroAlerts({
      today,
      rules,
      totals: JSON.parse(totalsKey) as MacroTotals,
      macroNames: JSON.parse(namesKey) as Record<string, string>,
      language: appLocale,
    });
  }, [alertsActive, isLoading, today, rules, totalsKey, namesKey, appLocale]);

  // On resume, refetch so food logged elsewhere or a day rollover is seen.
  useEffect(() => {
    if (!alertsActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [alertsActive, refetch]);
}

/** Test-only helper: drops any queued reconcile work. */
export function __resetMacroAlertStateForTests(): void {
  chain.resetForTests();
}
