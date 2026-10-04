import { useEffect } from 'react';
import type { WaterContainer } from '../types/measurements';
import {
  onAppBecameActive,
  syncBackgroundWater,
} from '../services/backgroundWater';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { usePreferences } from './usePreferences';

/**
 * While the opt-in setting is on, keeps the native Siri and Shortcuts actions
 * pointed at the container the dashboard is using, the weight unit in use, and
 * holding the current login (a session token can be renewed while the app runs). Switching the
 * setting off erases the native copy.
 */
export function useBackgroundWaterSync(
  container: WaterContainer | undefined
): void {
  const enabled = useAppPreferencesStore((s) => s.backgroundWaterEnabled);
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'lbs' ||
    preferences?.default_weight_unit === 'st_lbs'
      ? 'lbs'
      : 'kg';
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
    void syncBackgroundWater(enabled, target, weightUnit);
    if (!enabled) return;
    return onAppBecameActive(
      () => void syncBackgroundWater(enabled, target, weightUnit)
    );
  }, [enabled, id, name, volume, unit, servings, linkedFoodId, weightUnit]);
}
