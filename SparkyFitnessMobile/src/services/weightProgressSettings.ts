import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_WEIGHT_PROGRESS_SETTINGS,
  parseWeightProgressSettings,
  type WeightProgressSettings,
} from '@workspace/shared';
import { addLog } from './LogService';

// The weight progress card's own choices (custom start, milestones off, the
// milestones already shown), kept on this device per server, as the web keeps
// its own in the browser.

const KEY_PREFIX = '@SparkyFitness/weightProgress.v1';
const storageKey = (serverId: string | null) =>
  `${KEY_PREFIX}.${serverId ?? 'none'}`;

export async function loadWeightProgressSettings(
  serverId: string | null
): Promise<WeightProgressSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(serverId));
    if (!raw) return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
    return parseWeightProgressSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
  }
}

export async function saveWeightProgressSettings(
  serverId: string | null,
  settings: WeightProgressSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(serverId), JSON.stringify(settings));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Weight progress] Failed to save settings: ${message}`, 'WARNING');
  }
}
