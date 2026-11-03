import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import { learnScale, type LearnedScale } from '../utils/indoorDistanceScale';

/**
 * The learned factor for the watch's indoor distance (see
 * `utils/indoorDistanceScale.ts`), kept on this phone and sent to the watch in
 * its context as `indoorDistanceScale`.
 */
const STORAGE_KEY = '@SparkyFitness/watchIndoorScale';

type Kind = 'walk' | 'run';
/** Where the correction was entered: on the wrist, or on the phone's run summary. */
export type LearnSource = 'watch' | 'phone';
type Stored = Partial<Record<Kind, LearnedScale>>;

const listeners = new Set<() => void>();

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

/** The factors to send to the watch; 1 for a kind with nothing learned. */
export async function getWatchIndoorScale(): Promise<{
  walk: number;
  run: number;
}> {
  const stored = await read();
  return { walk: stored.walk?.scale ?? 1, run: stored.run?.scale ?? 1 };
}

/** Called when a learned factor changes, so the watch context is resent. */
export function onWatchIndoorScaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Learns from a treadmill distance entered for a watch indoor session.
 * Best effort: a storage failure is logged and never fails the caller.
 */
export async function learnWatchIndoorScale(
  kind: string,
  applied: number,
  shownMeters: number,
  enteredMeters: number,
  source: LearnSource = 'watch'
): Promise<void> {
  if (kind !== 'walk' && kind !== 'run') return;
  try {
    const stored = await read();
    const before = stored[kind] ?? null;
    const next = learnScale(before, applied, shownMeters, enteredMeters);
    // The inputs of every correction, learned from or not, so a factor that
    // looks wrong can be traced to the entries that made it.
    const details = [
      `source: ${source}`,
      `factor applied on the watch: ${applied.toFixed(3)}`,
      `watch showed: ${Math.round(shownMeters)} m`,
      `watch raw (shown / applied): ${Math.round(shownMeters / applied)} m`,
      `entered: ${Math.round(enteredMeters)} m`,
      `factor before: ${before ? `${before.scale.toFixed(3)} (${before.samples} corrections)` : 'none'}`,
    ];
    if (!next) {
      addLog(
        `[Watch Run] Indoor ${kind} correction taught nothing (no distance, or within 1% of what the watch showed)`,
        'INFO',
        details
      );
      return;
    }
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...stored, [kind]: next })
    );
    addLog(
      `[Watch Run] Indoor ${kind} distance factor now ${next.scale.toFixed(3)} (${next.samples} corrections)`,
      'INFO',
      details
    );
    listeners.forEach((listener) => listener());
  } catch (error) {
    addLog(
      `[Watch Run] Could not learn the indoor distance factor: ${String(error)}`,
      'WARNING'
    );
  }
}
