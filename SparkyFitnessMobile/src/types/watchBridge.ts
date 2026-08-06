/**
 * Wire contract between the phone app and the watchOS companion, carried over
 * WatchConnectivity by `sparky-watch-connectivity` (native module) and
 * `services/watchConnectivity.ios.ts` (JS wrapper).
 *
 * `WatchAppContext` is pushed phone → watch via `WCSession.updateApplicationContext`,
 * which replaces the whole dictionary on every call — there is no merge on
 * the OS side, so `services/watchContext.ts` is the single place that
 * assembles and sends this shape. `WatchCommand` is sent watch → phone as a
 * message/user-info dict with a `type` discriminator; `WatchWorkoutBridge`
 * is the single place that receives and dispatches it.
 *
 * Both directions are intentionally self-contained JSON: a command carries
 * every value it needs (e.g. `weightUnit` on `logSet`) instead of assuming
 * the watch and phone agree on the last-pushed context, since the two can
 * race or arrive out of order.
 *
 * Keep this file's shapes in lockstep with `targets/watch-app/Models.swift` —
 * that Swift file decodes these exact field names.
 */

export type WatchWeightUnit = 'kg' | 'lbs';

export interface WatchTodayPayload {
  date: string;
  food: number;
  burned: number;
  goal: number;
  remaining: number;
  /** 0-1, clamped. */
  progress: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WatchPresetSummary {
  id: number;
  name: string;
  exerciseCount: number;
}

export interface WatchSetDot {
  id: string;
  completed: boolean;
  isActive: boolean;
}

export interface WatchRestState {
  state: 'ready' | 'resting' | 'paused';
  durationSec: number;
  /** Epoch ms; non-null only while resting. */
  endsAt: number | null;
}

export interface WatchActiveWorkoutPayload {
  sessionId: string;
  workoutName: string;
  exerciseName: string;
  setNumber: number;
  setCount: number;
  activeSetId: string | null;
  targetReps: number | null;
  targetWeight: number | null;
  weightUnit: WatchWeightUnit;
  setDots: WatchSetDot[];
  rest: WatchRestState;
  /** Epoch ms. */
  startedAt: number | null;
  isFinished: boolean;
}

/** The full state mirrored to the watch. Sent as one JSON blob (see file doc). */
export interface WatchAppContext {
  today: WatchTodayPayload | null;
  presets: WatchPresetSummary[];
  activeWorkout: WatchActiveWorkoutPayload | null;
  serverConnected: boolean;
  /** Epoch seconds this context was generated, so the watch can show staleness. */
  generatedAt: number;
}

export type WatchCommand =
  | { type: 'startPreset'; presetId: number }
  | { type: 'logSet'; setId: string; reps: number | null; weight: number | null; weightUnit: WatchWeightUnit }
  | { type: 'skipRest' }
  | { type: 'adjustRest'; deltaSec: number }
  | { type: 'finishWorkout' }
  | { type: 'requestSync' };

export interface WatchReachabilityInfo {
  reachable: boolean;
  paired: boolean;
  watchAppInstalled: boolean;
}
