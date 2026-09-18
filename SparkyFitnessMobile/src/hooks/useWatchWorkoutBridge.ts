import { useCallback, useEffect, useRef } from 'react';
import WatchConnectivity, {
  type WatchSetCompletedPayload,
  type WatchHeartRateBatchPayload,
  type WatchHeartRateSamplePayload,
  type WatchWorkoutStopPayload,
} from '../../modules/watch-connectivity';
import {
  useActiveWorkoutStore,
  type ActiveSetPatch,
} from '../stores/activeWorkoutStore';
import { saveActiveWorkoutSession } from './useActiveWorkoutAutosave';
import { attachExerciseEntryHeartRate } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { queryClient } from './queryClient';

/**
 * Bridges the Apple Watch's live workout tracking (Workout tab) to the
 * active-workout store and server.
 *
 * The watch never talks to the server itself — it only reports set
 * completions and heart-rate batches for whatever session `useWatchWorkoutBridge`
 * pushed via `sendWorkoutStart` (see `useStartLiveWorkout.ts`). A completed
 * set is handed straight to `useActiveWorkoutStore`'s own `completeSet`, which
 * already owns rest timers, PR detection and autosave dirtying for a
 * phone-logged set — this only adds the immediate flush a phone screen that
 * isn't open would otherwise wait on. Heart rate is buffered per exercise
 * entry (the watch tags each batch with whichever exercise is on screen) and
 * attached once the workout ends — from either end, see `flushHeartRate`.
 *
 * iOS-only; a no-op everywhere else.
 */
export function useWatchWorkoutBridge(enabled: boolean): void {
  // Heart-rate samples captured so far this workout, keyed by exercise_entries
  // id. Cleared once attached on workoutStop; also the record that survives a
  // slow/failed attach being retried isn't kept — a lost batch here is a
  // bounded accuracy loss, not a correctness bug, the same tradeoff
  // OutboundPayloads.heartRateBatch makes on the watch side.
  const hrBufferRef = useRef<Map<string, WatchHeartRateSamplePayload[]>>(
    new Map()
  );
  // Guards a queued setCompleted transfer being delivered (and thus
  // completeSet'd) twice — WatchConnectivity makes no once-only promise.
  const handledSetClientIdsRef = useRef<Set<string>>(new Set());

  const handleSetCompleted = useCallback(
    async (payload: WatchSetCompletedPayload): Promise<void> => {
      if (!WatchConnectivity) return;
      if (handledSetClientIdsRef.current.has(payload.clientId)) return;
      handledSetClientIdsRef.current.add(payload.clientId);

      const state = useActiveWorkoutStore.getState();
      if (state.sessionId !== payload.sessionId) {
        // The watch is reporting a set for a session this phone no longer
        // considers live (finished, discarded, or superseded by a new live
        // start) — nothing to complete it against.
        addLog(
          `Watch set-completed ignored: no matching active session (${payload.sessionId})`,
          'WARNING'
        );
        return;
      }
      // Values the wearer typed on the watch land first: `completeSet` runs
      // the store's assumed-value adoption, which only fills a field that is
      // still empty, so patching afterwards would be overwriting a value the
      // store had already committed. Each field is omitted unless the watch
      // actually had one — writing null would clear the planned value.
      const patch: ActiveSetPatch = {};
      if (payload.weightKg != null) patch.weight = payload.weightKg;
      if (payload.reps != null) patch.reps = payload.reps;
      if (Object.keys(patch).length > 0) {
        state.updateSetField(payload.setId, patch);
      }

      state.completeSet(payload.setId);
      // Flushed immediately rather than left to the debounced autosave: the
      // phone screen that normally drives that debounce may not even be
      // open while the wearer is logging entirely from the watch.
      await saveActiveWorkoutSession(queryClient);
    },
    []
  );

  const handleHeartRateBatch = useCallback(
    (payload: WatchHeartRateBatchPayload): void => {
      const sessionId = useActiveWorkoutStore.getState().sessionId;
      if (sessionId !== payload.sessionId) return;
      const existing = hrBufferRef.current.get(payload.exerciseEntryId) ?? [];
      hrBufferRef.current.set(
        payload.exerciseEntryId,
        existing.concat(payload.samples)
      );
    },
    []
  );

  // Attaches everything buffered this workout and empties the buffer. Safe
  // to call twice — the second call finds nothing left, which is what makes
  // it harmless for the watch's `workoutStop` to arrive after the phone has
  // already ended the same session itself.
  const flushHeartRate = useCallback(async (): Promise<void> => {
    const buffered = Array.from(hrBufferRef.current.entries());
    hrBufferRef.current.clear();
    for (const [exerciseEntryId, samples] of buffered) {
      // The zone calculator needs at least two samples to derive a
      // duration between them; a lone reading has nothing to attach.
      if (samples.length < 2) continue;
      try {
        await attachExerciseEntryHeartRate(exerciseEntryId, samples);
      } catch (error) {
        addLog(
          `Failed to attach watch heart rate to exercise entry ${exerciseEntryId}: ${String(error)}`,
          'ERROR'
        );
      }
    }
  }, []);

  const handleWorkoutStop = useCallback(
    async (_payload: WatchWorkoutStopPayload): Promise<void> => {
      await flushHeartRate();
    },
    [flushHeartRate]
  );

  const handlersRef = useRef({
    handleSetCompleted,
    handleHeartRateBatch,
    handleWorkoutStop,
    flushHeartRate,
  });
  useEffect(() => {
    handlersRef.current = {
      handleSetCompleted,
      handleHeartRateBatch,
      handleWorkoutStop,
      flushHeartRate,
    };
  });

  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;

    const setCompletedSub = WatchConnectivity.addListener(
      'onSetCompleted',
      (payload) => {
        void handlersRef.current.handleSetCompleted(payload);
      }
    );
    const heartRateBatchSub = WatchConnectivity.addListener(
      'onHeartRateBatch',
      (payload) => {
        handlersRef.current.handleHeartRateBatch(payload);
      }
    );
    const workoutStopSub = WatchConnectivity.addListener(
      'onWorkoutStop',
      (payload) => {
        void handlersRef.current.handleWorkoutStop(payload);
      }
    );

    return () => {
      setCompletedSub.remove();
      heartRateBatchSub.remove();
      workoutStopSub.remove();
    };
  }, [enabled]);

  // The other way a workout ends: the wearer finished (or discarded) it on
  // the PHONE. The watch has no idea that happened, so without this it keeps
  // an HKWorkoutSession running against a closed session and every sample it
  // captured sits in the buffer until the app is killed. Watching the store
  // rather than hooking the finish screen catches every exit — finish,
  // discard, and "Clear & Start" superseding one workout with another.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;

    return useActiveWorkoutStore.subscribe((state, prevState) => {
      const ended = prevState.sessionId;
      if (ended === null || state.sessionId === ended) return;
      void WatchConnectivity?.stopWorkout(ended);
      void handlersRef.current.flushHeartRate();
    });
  }, [enabled]);
}
