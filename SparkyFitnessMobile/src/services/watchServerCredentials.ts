import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import { getAuthHeaders } from './api/authService';
import {
  getActiveServerConfig,
  getActiveServerConfigId,
  proxyHeadersToRecord,
} from './storage';
import { normalizeUrl } from '../utils/serverUrl';

/**
 * Syncs the active server's owner id and credentials to the Android native
 * watch-connectivity module from a single `ServerConfig` snapshot so the
 * headless Wear OS listener service uses one consistent server configuration.
 *
 * On iOS, `useWatchWorkoutBridge` already owns `setTelemetryOwner` and the
 * native module has no headless credential store, so this only reads the active
 * server id.
 */
export async function syncWatchServerCredentials(): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return getActiveServerConfigId();
  }
  const activeCfg = await getActiveServerConfig();
  const workoutServerId = activeCfg?.id ?? null;
  if (!WatchConnectivity) {
    return workoutServerId;
  }
  try {
    await WatchConnectivity.setTelemetryOwner?.(workoutServerId ?? '');
    if (activeCfg?.url) {
      await WatchConnectivity.setServerCredentials?.(
        normalizeUrl(activeCfg.url),
        {
          ...proxyHeadersToRecord(activeCfg.proxyHeaders),
          ...getAuthHeaders(activeCfg),
          'X-Meal-Model-Version': '2',
        }
      );
    } else {
      await WatchConnectivity.clearServerCredentials?.();
    }
  } catch {
    // Best-effort credential cache for Android headless Wear OS service.
  }
  return workoutServerId;
}

/**
 * Verifies that an inbound watch payload belongs to the currently active server
 * configuration when the payload carries an `ownerId`. Payloads without an
 * `ownerId` (iOS Apple Watch transfers) pass through unchanged.
 */
export async function isPayloadForActiveServer(payload: {
  ownerId?: string;
}): Promise<boolean> {
  if (!payload.ownerId) {
    return true;
  }
  const activeOwnerId = await getActiveServerConfigId();
  return Boolean(activeOwnerId) && payload.ownerId === activeOwnerId;
}
