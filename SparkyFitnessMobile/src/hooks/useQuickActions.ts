import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { navigationRef } from '../components/ActiveWorkoutBar';
import {
  changeWaterIntake,
  fetchWaterContainers,
} from '../services/api/measurementsApi';
import { DEFAULT_WATER_CONTAINER_ID } from './useWaterIntakeMutation';
import {
  caffeineActiveQueryKey,
  dailySummaryQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { queryClient } from './queryClient';
import { getTodayDate } from '../utils/dateUtils';
import { addLog } from '../services/LogService';

type QuickActionId = 'scan-food' | 'search-food' | 'log-water' | 'fasting';

/**
 * `hideLogWater` drops the Log water entry. A Home Screen quick action always
 * opens the app, so once the opt-in "log without opening the app" shortcut
 * exists it would be the worse way to log a drink.
 */
export function quickActionItems(
  options: { hideLogWater?: boolean } = {}
): QuickActions.Action[] {
  const items: QuickActions.Action[] = [
    {
      id: 'scan-food',
      title: i18n.t('quickActions.scanFood', { defaultValue: 'Scan food' }),
      icon: 'symbol:barcode.viewfinder',
    },
    {
      id: 'search-food',
      title: i18n.t('quickActions.searchFood', { defaultValue: 'Log food' }),
      icon: 'symbol:magnifyingglass',
    },
    {
      id: 'log-water',
      title: i18n.t('quickActions.logWater', { defaultValue: 'Log water' }),
      icon: 'symbol:drop.fill',
    },
    {
      id: 'fasting',
      title: i18n.t('quickActions.fasting', { defaultValue: 'Fasting' }),
      icon: 'symbol:timer',
    },
  ];
  return options.hideLogWater
    ? items.filter((item) => item.id !== 'log-water')
    : items;
}

/** Logs one drink of the primary (or only) container, without opening a screen. */
async function logWaterDrink(): Promise<void> {
  const date = getTodayDate();
  try {
    const containers = await fetchWaterContainers();
    const container =
      containers.find((c) => c.is_primary) ??
      (containers.length === 1 ? containers[0] : undefined);
    await changeWaterIntake({
      entryDate: date,
      changeDrinks: 1,
      containerId: container?.id ?? DEFAULT_WATER_CONTAINER_ID,
    });
    void queryClient.invalidateQueries({
      queryKey: dailySummaryQueryKey(date),
    });
    void queryClient.invalidateQueries({
      queryKey: waterIntakeLogQueryKey(date),
    });
    void queryClient.invalidateQueries({
      queryKey: caffeineActiveQueryKey(date),
    });
    Toast.show({
      type: 'success',
      text1: i18n.t('quickActions.waterLogged', {
        defaultValue: 'Water logged',
      }),
    });
  } catch (error) {
    void addLog(`Quick action water log failed: ${String(error)}`, 'WARNING');
    Toast.show({
      type: 'error',
      text1: i18n.t('quickActions.waterFailed', {
        defaultValue: 'Could not log water',
      }),
    });
  }
}

function whenNavigationReady(run: () => void, attempts = 40): void {
  if (navigationRef.isReady()) {
    run();
    return;
  }
  if (attempts > 0) {
    setTimeout(() => whenNavigationReady(run, attempts - 1), 250);
  }
}

export function runQuickAction(id: string): void {
  switch (id as QuickActionId) {
    case 'scan-food':
      whenNavigationReady(() => navigationRef.navigate('FoodScan'));
      return;
    case 'search-food':
      whenNavigationReady(() => navigationRef.navigate('FoodSearch'));
      return;
    case 'fasting':
      whenNavigationReady(() => navigationRef.navigate('FastingDetail'));
      return;
    case 'log-water':
      void logWaterDrink();
      return;
    default:
      return;
  }
}

/**
 * Home Screen long-press menu (iOS). Registers the shortcuts once the user is
 * signed in and runs the one the app was launched with, or tapped while
 * running.
 */
export function useQuickActions(enabled: boolean): void {
  const backgroundWater = useAppPreferencesStore(
    (s) => s.backgroundWaterEnabled
  );
  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') return;
    void QuickActions.setItems(
      quickActionItems({ hideLogWater: backgroundWater })
    ).catch(() => undefined);
    const initial = QuickActions.initial;
    if (initial) runQuickAction(initial.id);
    const subscription = QuickActions.addListener((action) =>
      runQuickAction(action.id)
    );
    return () => subscription.remove();
  }, [enabled, backgroundWater]);
}
