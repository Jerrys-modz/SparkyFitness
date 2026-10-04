import { AppState } from 'react-native';
import BackgroundWaterModule from '../../modules/background-water';
import type { WaterContainer } from '../types/measurements';
import { normalizeUrl } from '../utils/serverUrl';
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
  containerId: number;
  containerName: string;
  volumeLabel: string | null;
}

export function buildBackgroundWaterConfig(
  server: Awaited<ReturnType<typeof getActiveServerConfig>>,
  container: Pick<WaterContainer, 'id' | 'name' | 'volume' | 'unit'>
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
    containerId: container.id,
    containerName: container.name,
    volumeLabel: container.volume
      ? `${container.volume} ${container.unit}`
      : null,
  };
}

/**
 * Keeps the native copy of the login in step with the setting. With the
 * setting off, or no container, or no signed-in server, the copy is erased, so
 * nothing about the account stays readable outside the app.
 */
export async function syncBackgroundWater(
  enabled: boolean,
  container: Pick<WaterContainer, 'id' | 'name' | 'volume' | 'unit'> | undefined
): Promise<void> {
  if (!BackgroundWaterModule) return;
  try {
    const config =
      enabled && container
        ? buildBackgroundWaterConfig(await getActiveServerConfig(), container)
        : null;
    await BackgroundWaterModule.setConfig(
      config ? JSON.stringify(config) : null
    );
  } catch (error) {
    addLog(`[Background water] Could not update: ${String(error)}`, 'WARNING');
  }
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
