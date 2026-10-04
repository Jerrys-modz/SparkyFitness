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
  const id = container?.id;
  const name = container?.name;
  const volume = container?.volume;
  const unit = container?.unit;

  useEffect(() => {
    const target =
      id != null && name != null && volume != null && unit != null
        ? { id, name, volume, unit }
        : undefined;
    void syncBackgroundWater(enabled, target);
    if (!enabled) return;
    return onAppBecameActive(() => void syncBackgroundWater(enabled, target));
  }, [enabled, id, name, volume, unit]);
}
