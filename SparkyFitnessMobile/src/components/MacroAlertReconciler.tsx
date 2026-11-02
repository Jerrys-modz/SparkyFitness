import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDailySummary } from '../hooks/useDailySummary';
import { useMacroAlertReconciler } from '../hooks/useMacroAlert';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import type { MacroTotals } from '../utils/macroAlerts';

/**
 * Headless owner of macro alert reconciliation; renders nothing.
 *
 * Always reads today, not the Dashboard's selected date. Queries stay disabled
 * while alerts are off or the server is unreachable, but the hook still runs so
 * turning alerts off cancels what was scheduled.
 */
const MacroAlertReconciler: React.FC = () => {
  const { t } = useTranslation();
  const alertsActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.macroAlertsEnabled
  );
  const { isConnected } = useServerConnection();
  const queriesEnabled = alertsActive && isConnected;
  const today = getTodayDate();

  const {
    summary,
    isLoading,
    refetch: refetchSummary,
  } = useDailySummary({ date: today, enabled: queriesEnabled });

  const totals = useMemo<MacroTotals>(
    () =>
      summary
        ? {
            protein: summary.protein,
            carbs: summary.carbs,
            fat: summary.fat,
            fiber: summary.fiber,
            calories: {
              consumed: summary.calorieBalance.eaten,
              goal: summary.calorieBalance.goal,
            },
          }
        : {},
    [summary]
  );

  const macroNames = useMemo(
    () => ({
      protein: t('nutrients.protein', { defaultValue: 'Protein' }),
      carbs: t('nutrients.carbs', { defaultValue: 'Carbs' }),
      fat: t('nutrients.fat', { defaultValue: 'Fat' }),
      fiber: t('nutrients.fiber', { defaultValue: 'Fiber' }),
      calories: t('nutrients.calories', { defaultValue: 'Calories' }),
    }),
    [t]
  );

  const refetch = useCallback(() => {
    if (!queriesEnabled) return;
    void refetchSummary();
  }, [queriesEnabled, refetchSummary]);

  useMacroAlertReconciler({
    today,
    totals,
    macroNames,
    isLoading: queriesEnabled && (isLoading || summary === undefined),
    refetch,
  });

  return null;
};

export default MacroAlertReconciler;
