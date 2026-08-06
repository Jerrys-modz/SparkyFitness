/**
 * Single owner of the `WatchAppContext` pushed to the watch. `WCSession`'s
 * `updateApplicationContext` replaces the whole dictionary on every call —
 * it doesn't merge — so every caller (today's calorie snapshot, the presets
 * list, the active-workout mirror) must go through this module instead of
 * calling `WatchConnectivity.updateContext` directly, or the last writer
 * would silently erase everyone else's slice.
 *
 * This is a plain module-scope singleton, not a store, so it can be updated
 * from both a React hook (`useWidgetSync`) and a headless component
 * (`WatchWorkoutBridge`) without either needing to render the other's data.
 */
import type {
  WatchActiveWorkoutPayload,
  WatchAppContext,
  WatchPresetSummary,
  WatchTodayPayload,
} from '../types/watchBridge';
import { WatchConnectivity } from './watchConnectivity';

let today: WatchTodayPayload | null = null;
let presets: WatchPresetSummary[] = [];
let activeWorkout: WatchActiveWorkoutPayload | null = null;
let serverConnected = false;

function push(): void {
  if (!WatchConnectivity.isAvailable) return;
  const context: WatchAppContext = {
    today,
    presets,
    activeWorkout,
    serverConnected,
    generatedAt: Math.floor(Date.now() / 1000),
  };
  void WatchConnectivity.updateContext(context);
}

export function setWatchToday(payload: WatchTodayPayload | null): void {
  today = payload;
  push();
}

export function setWatchPresets(list: WatchPresetSummary[]): void {
  presets = list;
  push();
}

export function setWatchActiveWorkout(payload: WatchActiveWorkoutPayload | null): void {
  activeWorkout = payload;
  push();
}

export function setWatchServerConnected(connected: boolean): void {
  if (serverConnected === connected) return;
  serverConnected = connected;
  push();
}

/** Re-send the last-known full context, e.g. in response to a watch-side `requestSync`. */
export function resyncWatchContext(): void {
  push();
}
