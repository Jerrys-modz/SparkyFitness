import { useEffect, useRef } from 'react';
import type { WidgetLayout } from '@workspace/shared';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { addLog } from '../services/LogService';
import { useWidgetLayoutStore } from '../stores/widgetLayoutStore';

/** The widget kind and the app-group key the custom widget reads. */
export const CUSTOM_WIDGET_KIND = 'customWidget';
const CUSTOM_LAYOUTS_KEY = 'customWidgetLayouts';

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

const canSync = (): boolean => Platform.OS === 'ios' && !!iosAppGroup;

/**
 * Writes the saved widgets to the app group and reads them back. True when the
 * widget's copy now equals the list; a mismatch is logged.
 */
function writeLayouts(layouts: WidgetLayout[]): boolean {
  const storage = new ExtensionStorage(iosAppGroup as string);
  const json = JSON.stringify(layouts);
  storage.set(CUSTOM_LAYOUTS_KEY, json);
  const matches = storage.get(CUSTOM_LAYOUTS_KEY) === json;
  if (!matches) {
    addLog(
      `[customWidget] ${layouts.length} saved widget(s) did not reach the widget: the app group copy differs`,
      'WARNING'
    );
  }
  return matches;
}

/**
 * The "Reload widgets" button: writes the saved widgets again and reloads every
 * widget, for one that is blank or not updating. True when the widget's copy
 * of the list matches. The numbers on a widget come from the Dashboard's sync
 * and refresh when it next runs.
 */
export function reloadWidgets(layouts: WidgetLayout[]): boolean {
  if (!canSync()) return false;
  try {
    const matches = writeLayouts(layouts);
    if (matches) {
      addLog(
        `[customWidget] Reloading widgets: ${layouts.length} saved widget(s) written to the widget`,
        'INFO'
      );
    }
    // No name: every widget, not only the custom one.
    ExtensionStorage.reloadWidget();
    return matches;
  } catch (error) {
    addLog(`[customWidget] Failed to reload the widgets: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * Keeps the app group's copy of the saved widgets equal to the store, so the
 * custom widget (and its Edit Widget list) see every one. Mounted at the app
 * root: it must not depend on which screen is showing, as it did when it lived
 * in the Dashboard's sync hook.
 *
 * The list is always written, even empty, so a deleted widget does not linger.
 * Writing is read back and logged (Settings > View Logs) so a layout that did
 * not reach the widget shows up there. The widget is reloaded only once there
 * is something to show or the list changed, so a person who never builds a
 * widget costs nothing.
 */
export function useCustomWidgetLayoutSync(): void {
  const layouts = useWidgetLayoutStore((state) => state.layouts);
  const writtenRef = useRef(false);

  useEffect(() => {
    if (!canSync()) return;
    try {
      const matches = writeLayouts(layouts);
      const worthReloading = layouts.length > 0 || writtenRef.current;

      if (matches && worthReloading) {
        addLog(
          `[customWidget] ${layouts.length} saved widget(s) written to the widget`,
          'INFO'
        );
      }
      if (worthReloading) {
        ExtensionStorage.reloadWidget(CUSTOM_WIDGET_KIND);
      }
      writtenRef.current = true;
    } catch (error) {
      addLog(
        `[customWidget] Failed to write the saved widgets: ${error}`,
        'ERROR'
      );
    }
  }, [layouts]);
}
