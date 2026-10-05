import { AppState } from 'react-native';
import BackgroundWaterModule from '../../modules/background-water';
import type { WaterContainer } from '../types/measurements';
import { normalizeUrl } from '../utils/serverUrl';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  getServingVolume,
  volumeFromMl,
} from '../utils/unitConversions';
import { addLog } from './LogService';
import { getAuthHeaders } from './api/authService';
import { getActiveServerConfig, proxyHeadersToRecord } from './storage';

export function isBackgroundWaterSupported(): boolean {
  return BackgroundWaterModule != null;
}

/** What the native "Log water" shortcut needs to log a drink with the app closed. */
export interface BackgroundWaterConfig {
  baseUrl: string;
  headers: Record<string, string>;
  /** Absent when the user has no water container yet; water actions then ask for one. */
  containerId?: number;
  containerName?: string;
  volumeLabel?: string | null;
  /** The unit a weight is spoken or typed in; the server always stores kg. */
  weightUnit: 'kg' | 'lbs';
}

type BackgroundWaterContainer = Pick<
  WaterContainer,
  | 'id'
  | 'name'
  | 'volume'
  | 'unit'
  | 'servings_per_container'
  | 'linked_food_id'
>;

/** What one drink holds, in the container's own unit, e.g. "16 oz". */
export function drinkVolumeLabel(
  container: BackgroundWaterContainer
): string | null {
  // Volumes are stored in millilitres and divided into servings; a container
  // linked to a food has no volume of its own.
  const ml = getServingVolume(container);
  if (!ml || ml <= 0) return null;
  const unit = container.unit;
  return `${formatVolumeForUnit(volumeFromMl(ml, unit), unit)} ${WATER_UNIT_LABELS[unit] ?? unit}`;
}

export function buildBackgroundWaterConfig(
  server: Awaited<ReturnType<typeof getActiveServerConfig>>,
  container: BackgroundWaterContainer | undefined,
  weightUnit: 'kg' | 'lbs' = 'kg'
): BackgroundWaterConfig | null {
  if (!server) return null;
  const baseUrl = normalizeUrl(server.url);
  // The app refuses plain HTTP outside development; the shortcut must too.
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) return null;
  return {
    baseUrl,
    headers: {
      ...proxyHeadersToRecord(server.proxyHeaders),
      ...getAuthHeaders(server),
      'X-Meal-Model-Version': '2',
    },
    ...(container
      ? {
          containerId: container.id,
          containerName: container.name,
          volumeLabel: drinkVolumeLabel(container),
        }
      : {}),
    weightUnit,
  };
}

/**
 * Keeps the native copy of the login in step with the setting. With the
 * setting off, or no container, or no signed-in server, the copy is erased, so
 * nothing about the account stays readable outside the app.
 */
let syncQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs one sync or clear at a time, in the order asked. Without this, a sync
 * waiting on the stored login could finish after a clear and write the login
 * back after the user switched the setting off.
 *
 * Resolves false when the native side refused to store the copy, so the caller
 * can switch the setting off and erase what was left.
 */
export function syncBackgroundWater(
  enabled: boolean,
  container: BackgroundWaterContainer | undefined,
  weightUnit: 'kg' | 'lbs' = 'kg'
): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!BackgroundWaterModule) return true;
    try {
      const config = enabled
        ? buildBackgroundWaterConfig(
            await getActiveServerConfig(),
            container,
            weightUnit
          )
        : null;
      const stored = await BackgroundWaterModule.setConfig(
        config ? JSON.stringify(config) : null
      );
      if (stored === false) {
        addLog('[Background water] The device refused to store it', 'WARNING');
        return false;
      }
    } catch (error) {
      addLog(
        `[Background water] Could not update: ${String(error)}`,
        'WARNING'
      );
    }
    return true;
  };
  const result = syncQueue.then(run, run);
  syncQueue = result;
  return result;
}

/** Erases the native copy, e.g. when the user signs out or removes the server. */
export async function clearBackgroundWater(): Promise<void> {
  await syncBackgroundWater(false, undefined);
}

export function onAppBecameActive(run: () => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
  return () => subscription.remove();
}
