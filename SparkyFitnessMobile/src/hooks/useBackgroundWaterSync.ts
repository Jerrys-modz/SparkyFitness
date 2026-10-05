import { useEffect } from 'react';
import type { WaterContainer } from '../types/measurements';
import {
  onAppBecameActive,
  syncBackgroundWater,
} from '../services/backgroundWater';

/**
 * Keeps the native Log water shortcut pointed at the container the dashboard
 * is using and holding the current login (a session token can be renewed while
 * the app runs). Removing the server erases the native copy.
 */
export function useBackgroundWaterSync(
  container: WaterContainer | undefined
): void {
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
    if (!target) return;
    const sync = (): void => void syncBackgroundWater(true, target);
    sync();
    return onAppBecameActive(sync);
  }, [id, name, volume, unit, servings, linkedFoodId]);
}
