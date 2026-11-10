import { useEffect, useRef } from 'react';

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

/**
 * Keeps the app group's copy of the saved widgets equal to the store, so the
 * custom widget (and its gallery cards and Edit Widget list) see every one.
 * Mounted at the app root: it must not depend on which screen is showing, as
 * it did when it lived in the Dashboard's sync hook.
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
    if (Platform.OS !== 'ios' || !iosAppGroup) return;
    try {
      const storage = new ExtensionStorage(iosAppGroup);
      const json = JSON.stringify(layouts);
      storage.set(CUSTOM_LAYOUTS_KEY, json);

      if (storage.get(CUSTOM_LAYOUTS_KEY) !== json) {
        addLog(
          `[customWidget] ${layouts.length} saved widget(s) did not reach the widget: the app group copy differs`,
          'WARNING'
        );
      } else if (layouts.length > 0 || writtenRef.current) {
        addLog(
          `[customWidget] ${layouts.length} saved widget(s) written to the widget`,
          'INFO'
        );
      }

      if (layouts.length > 0 || writtenRef.current) {
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
