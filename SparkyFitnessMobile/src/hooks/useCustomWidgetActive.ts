import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';

/** The widget kind the iOS custom widget registers. */
export const CUSTOM_WIDGET_KIND = 'customWidget';
/**
 * App-group key the widget stamps (epoch seconds) each time iOS asks it for a
 * timeline, which only happens while one is placed on a screen. The widget
 * lets the person pick any numbers in Edit Widget, so the app cannot know
 * which ones are wanted; this stamp is how it knows whether any widget exists.
 */
export const CUSTOM_WIDGET_ACTIVE_KEY = 'customWidgetActiveAt';
/**
 * A widget is refreshed several times a day while placed, so a stamp older
 * than this means it was removed.
 */
export const CUSTOM_WIDGET_ACTIVE_WINDOW_SECONDS = 2 * 24 * 60 * 60;

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

export function readCustomWidgetActive(nowSeconds: number): boolean {
  if (Platform.OS !== 'ios' || !iosAppGroup) return false;
  try {
    const stamp = Number(
      new ExtensionStorage(iosAppGroup).get(CUSTOM_WIDGET_ACTIVE_KEY)
    );
    return (
      Number.isFinite(stamp) &&
      stamp > 0 &&
      nowSeconds - stamp < CUSTOM_WIDGET_ACTIVE_WINDOW_SECONDS
    );
  } catch {
    return false;
  }
}

/**
 * Whether a custom widget is on the Home Screen or Lock Screen, so the
 * Dashboard fetches the extra figures (sleep, heart rate, fasting, streak)
 * only for people who have one. Read on mount and each time the app comes to
 * the foreground, which is when a widget just added would first matter.
 */
export function useCustomWidgetActive(): boolean {
  const [active, setActive] = useState(() =>
    readCustomWidgetActive(Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setActive(readCustomWidgetActive(Math.floor(Date.now() / 1000)));
      }
    });
    return () => subscription.remove();
  }, []);

  return active;
}
