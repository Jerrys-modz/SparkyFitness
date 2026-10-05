import { useEffect } from 'react';
import type { WaterContainer } from '../types/measurements';
import {
  onAppBecameActive,
  syncBackgroundWater,
} from '../services/backgroundWater';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * While the opt-in setting is on, keeps the native "Log water" shortcut
 * pointed at the container the dashboard is using and holding the current
 * login (a session token can be renewed while the app runs). Switching the
 * setting off erases the native copy.
 */
export function useBackgroundWaterSync(
  container: WaterContainer | undefined
): void {
  const enabled = useAppPreferencesStore((s) => s.backgroundWaterEnabled);
  const setEnabled = useAppPreferencesStore((s) => s.setBackgroundWaterEnabled);
  const id = container?.id;
  const name = container?.name;
  const volume = container?.volume;
  const unit = container?.unit;
  const servings = container?.servings_per_container;
  const linkedFoodId = container?.linked_food_id;

  useEffect(() => {
    const target =
      id != null && name != null && volume != null && unit != null
        ? {
            id,
            name,
            volume,
            unit,
            servings_per_container: servings ?? 1,
            linked_food_id: linkedFoodId,
          }
        : undefined;
    // Still loading: keep what the device holds rather than erasing it.
    if (enabled && !target) return;
    const sync = (): void => {
      void syncBackgroundWater(enabled, target).then((stored) => {
        // Switching off erases whatever the device kept of the failed copy.
        if (!stored) setEnabled(false);
      });
    };
    sync();
    if (!enabled) return;
    return onAppBecameActive(sync);
  }, [enabled, setEnabled, id, name, volume, unit, servings, linkedFoodId]);
}
