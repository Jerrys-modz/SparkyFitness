import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

/**
 * The fuel and drink reminders last planned on this phone, kept so the Apple
 * Watch can offer them as the starting point on its start screen (they ride in
 * the watch context as `runFuelIntervalMin`, `runFuelPortionGrams`,
 * `runDrinkIntervalMin` and `runDrinkMl`). A run only has reminders when they
 * are turned on for it on the watch.
 */
const STORAGE_KEY = '@SparkyFitness/watchFuelingPreference';

export interface WatchFuelingPreference {
  carbIntervalMin: number;
  portionGrams: number;
  drinkIntervalMin: number;
  mlPerDrink: number;
}

// The ranges the watch's steppers allow; keep in step with
// `WatchFuelingPlan` in targets/watch/Domain/WatchFueling.swift.
const CARB_INTERVAL_RANGE = [10, 60] as const;
const PORTION_RANGE = [5, 100] as const;
const DRINK_INTERVAL_RANGE = [5, 60] as const;
const ML_RANGE = [50, 500] as const;

const listeners = new Set<() => void>();

function clampTo(value: unknown, [min, max]: readonly [number, number]) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** The preference with every number inside what the watch accepts, or null if any is unusable. */
export function normalizeWatchFuelingPreference(
  value: Partial<Record<keyof WatchFuelingPreference, unknown>> | null
): WatchFuelingPreference | null {
  if (!value) return null;
  const carbIntervalMin = clampTo(value.carbIntervalMin, CARB_INTERVAL_RANGE);
  const portionGrams = clampTo(value.portionGrams, PORTION_RANGE);
  const drinkIntervalMin = clampTo(
    value.drinkIntervalMin,
    DRINK_INTERVAL_RANGE
  );
  const mlPerDrink = clampTo(value.mlPerDrink, ML_RANGE);
  if (
    carbIntervalMin === null ||
    portionGrams === null ||
    drinkIntervalMin === null ||
    mlPerDrink === null
  ) {
    return null;
  }
  return { carbIntervalMin, portionGrams, drinkIntervalMin, mlPerDrink };
}

/** The saved preference, or null when none was saved or it is unreadable. */
export async function getWatchFuelingPreference(): Promise<WatchFuelingPreference | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? normalizeWatchFuelingPreference(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Called when the preference changes, so the watch context is resent. */
export function onWatchFuelingPreferenceChange(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Remembers the plan for the watch. Best effort: a storage failure is logged
 * and never fails the caller, who is starting phone reminders.
 */
export async function saveWatchFuelingPreference(
  preference: WatchFuelingPreference
): Promise<void> {
  const normalized = normalizeWatchFuelingPreference(preference);
  if (!normalized) return;
  try {
    const current = await getWatchFuelingPreference();
    if (JSON.stringify(current) === JSON.stringify(normalized)) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    addLog(`Saving the watch fueling plan failed: ${String(error)}`, 'ERROR');
    return;
  }
  listeners.forEach((listener) => listener());
}

/** The watch context keys for a preference; nothing when there is none, so the watch keeps its last. */
export function watchFuelingContext(
  preference: WatchFuelingPreference | null
): {
  runFuelIntervalMin?: number;
  runFuelPortionGrams?: number;
  runDrinkIntervalMin?: number;
  runDrinkMl?: number;
} {
  if (!preference) return {};
  return {
    runFuelIntervalMin: preference.carbIntervalMin,
    runFuelPortionGrams: preference.portionGrams,
    runDrinkIntervalMin: preference.drinkIntervalMin,
    runDrinkMl: preference.mlPerDrink,
  };
}
