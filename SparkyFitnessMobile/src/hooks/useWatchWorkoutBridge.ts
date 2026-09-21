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
import { attachExerciseEntryWatchTelemetry } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { queryClient } from './queryClient';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { normalizeDate } from '../utils/dateUtils';

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
 * entry, along with the active energy it measured (the watch tags each batch
 * with whichever exercise is on screen), and attached once the workout ends —
 * from either end, see `flushHeartRate`. The measured energy replaces the
 * server's duration-and-sets calorie estimate for those entries.
 *
 * iOS-only; a no-op everywhere else.
 */
export function useWatchWorkoutBridge(enabled: boolean): void {
  // Heart-rate samples captured so far this workout, keyed by exercise_entries
  // id. NOT cleared by a flush: every field the server derives from a post
  // (avg, max, calories, the zone rows it upserts) is computed from the whole
  // payload, so re-posting the accumulated series overwrites the earlier,
  // shorter one with a strictly better answer. Posting only the part that
  // arrived since would instead clobber a workout's avg HR with its last
  // minute's. The buffer is dropped when a different session's first batch
  // arrives.
  const hrBufferRef = useRef<Map<string, WatchHeartRateSamplePayload[]>>(
    new Map()
  );
  // Active energy the watch measured, summed per exercise entry from the
  // per-batch deltas it sends. Kept separate from the sample buffer because
  // a batch can carry energy with no samples, or samples with no energy —
  // HealthKit permissions are granted per type.
  const energyBufferRef = useRef<Map<string, number>>(new Map());
  // The session the two buffers above hold data for. Kept separately from the
  // store's own `sessionId` precisely because it must outlive it: the watch's
  // final batch lands AFTER the phone has ended the session (see the store
  // subscription at the bottom of this file), and the buffer has to still
  // recognise it as belonging to the workout that just finished.
  const bufferedSessionIdRef = useRef<string | null>(null);
  // Whether the buffers hold anything not yet accepted by the server. Lets a
  // second flush — the watch's stop signal racing the phone's own, or a late
  // batch arriving after both — cost nothing when there is nothing new, while
  // still retrying after a failed attach.
  const hasUnpostedRef = useRef(false);
  // Guards a queued setCompleted transfer being delivered (and thus
  // completeSet'd) twice — WatchConnectivity makes no once-only promise.
  const handledSetClientIdsRef = useRef<Set<string>>(new Set());
  // Same for heart-rate batches: `transferUserInfo` can redeliver, and the
  // energy field is a delta, so applying it twice doubles calories. Samples
  // are also timestamp-deduped below as a belt for a missing clientId.
  const handledHrBatchClientIdsRef = useRef<Set<string>>(new Set());
  // Points at `flushHeartRate` below, which the batch handler needs for a
  // late arrival but which is declared after it. Populated by the same effect
  // that syncs `handlersRef`, which runs before the listeners are attached.
  const flushHeartRateRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  // Captured when a session becomes live so a flush after the store has
  // already been cleared (watch finish, or a late batch after a phone finish)
  // can still invalidate the diary for the right day.
  const entryDateRef = useRef<string | null>(null);

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
      const liveSessionId = useActiveWorkoutStore.getState().sessionId;
      // A batch belongs here if it is for the live session OR for the one the
      // buffers already hold — the latter is how the watch's final drain, sent
      // in answer to a phone-side finish, still counts. Anything else is from
      // a workout this phone has no record of.
      if (
        payload.sessionId !== liveSessionId &&
        payload.sessionId !== bufferedSessionIdRef.current
      ) {
        return;
      }
      if (payload.sessionId !== bufferedSessionIdRef.current) {
        // A new workout: whatever the last one left behind was either already
        // posted or is now unreachable, and must not be attributed to this one.
        hrBufferRef.current = new Map();
        energyBufferRef.current = new Map();
        bufferedSessionIdRef.current = payload.sessionId;
        hasUnpostedRef.current = false;
        handledHrBatchClientIdsRef.current = new Set();
      }
      if (payload.clientId) {
        if (handledHrBatchClientIdsRef.current.has(payload.clientId)) {
          return;
        }
        handledHrBatchClientIdsRef.current.add(payload.clientId);
      }
      if (payload.samples.length > 0) {
        const existing = hrBufferRef.current.get(payload.exerciseEntryId) ?? [];
        const seen = new Set(existing.map((sample) => sample.t));
        const added = payload.samples.filter(
          (sample) => sample?.t && !seen.has(sample.t)
        );
        if (added.length > 0) {
          hrBufferRef.current.set(
            payload.exerciseEntryId,
            existing.concat(added)
          );
          hasUnpostedRef.current = true;
        }
      }
      // Energy is a delta. A redelivered batch without a clientId cannot be
      // distinguished from a new one, so skip calories rather than double
      // them. Samples still merge via the timestamp set above.
      if (payload.clientId && payload.activeEnergyKcal != null) {
        const existing =
          energyBufferRef.current.get(payload.exerciseEntryId) ?? 0;
        energyBufferRef.current.set(
          payload.exerciseEntryId,
          existing + payload.activeEnergyKcal
        );
        hasUnpostedRef.current = true;
      }
      // Arrived after the workout already ended, so nothing else is coming to
      // trigger a flush — attach it now. This is the ordinary path for a
      // workout finished on the PHONE: the stop signal and the flush both go
      // out before the watch has had a chance to answer with its last minute.
      if (payload.sessionId !== liveSessionId) {
        void flushHeartRateRef.current();
      }
    },
    []
  );

  // Attaches everything buffered this workout, and leaves the buffer intact.
  // Safe to call repeatedly: a call with nothing new since the last one does
  // no work, which is what makes it harmless for the watch's `workoutStop` to
  // arrive after the phone has already ended the same session itself. When
  // something HAS arrived since — the watch's final drain, typically — the
  // re-post carries the whole accumulated series rather than the tail, so the
  // server recomputes avg/max, calories and the zone rows over the full
  // workout instead of overwriting them with its last minute.
  const flushHeartRate = useCallback(async (): Promise<void> => {
    if (!hasUnpostedRef.current) return;
    const samplesByEntry = hrBufferRef.current;
    const energyByEntry = energyBufferRef.current;
    // Cleared up front so a batch arriving mid-flush re-arms it rather than
    // being marked posted by this pass, which never saw it.
    hasUnpostedRef.current = false;

    // One post per exercise entry carrying whichever of the two the watch
    // actually produced, so an entry with energy but no usable series still
    // gets its measured calories.
    const entryIds = new Set([
      ...samplesByEntry.keys(),
      ...energyByEntry.keys(),
    ]);
    for (const exerciseEntryId of entryIds) {
      const samples = samplesByEntry.get(exerciseEntryId) ?? [];
      const kcal = energyByEntry.get(exerciseEntryId);
      // The zone calculator needs at least two samples to derive a duration
      // between them; a lone reading has nothing to attach, and the server
      // rejects a one-sample series outright.
      const hrSamples = samples.length >= 2 ? samples : undefined;
      // Both absent means there is nothing to say; the server rejects that
      // body, so don't spend a request discovering it.
      if (!hrSamples && kcal == null) continue;
      try {
        await attachExerciseEntryWatchTelemetry(exerciseEntryId, {
          ...(hrSamples ? { hrSamples } : {}),
          ...(kcal != null ? { activeEnergyKcal: kcal } : {}),
        });
      } catch (error) {
        // Left dirty so the next flush retries this entry. The buffer still
        // holds every sample, so that retry posts the full series, not a
        // remnant of it.
        hasUnpostedRef.current = true;
        addLog(
          `Failed to attach watch telemetry to exercise entry ${exerciseEntryId}: ${String(error)}`,
          'ERROR'
        );
      }
    }
    if (entryDateRef.current) {
      invalidateExerciseCache(queryClient, entryDateRef.current);
    }
  }, []);

  const handleWorkoutStop = useCallback(
    async (payload: WatchWorkoutStopPayload): Promise<void> => {
      await flushHeartRate();
      const state = useActiveWorkoutStore.getState();
      // Finishing on the watch used to only attach HR, leaving the phone's
      // live session (and HUD) running against a workout the wrist already
      // ended. Flush any dirty sets, then clear — same outcome as the phone's
      // own Finish, minus the celebration screen this headless hook cannot
      // navigate to.
      if (state.sessionId === payload.sessionId) {
        await saveActiveWorkoutSession(queryClient);
        useActiveWorkoutStore.getState().clearWorkout();
      }
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
    flushHeartRateRef.current = flushHeartRate;
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

    const current = useActiveWorkoutStore.getState();
    if (current.sessionId != null) {
      bufferedSessionIdRef.current = current.sessionId;
      entryDateRef.current =
        current.session?.entry_date != null
          ? normalizeDate(current.session.entry_date)
          : null;
    }

    return useActiveWorkoutStore.subscribe((state, prevState) => {
      if (state.sessionId === prevState.sessionId) return;
      const ended = prevState.sessionId;
      if (ended !== null) {
        void WatchConnectivity?.stopWorkout(ended);
        // Posts what has arrived so far. The watch answers that stop signal
        // with its own final drain, which lands here afterwards and re-posts
        // the completed series — see `handleHeartRateBatch`.
        void handlersRef.current.flushHeartRate();
      }
      // A newly live session claims the buffers now rather than when its first
      // batch arrives, so that a workout too short to have produced one (they
      // are a minute apart) still has its session recognised when the final
      // drain shows up after the phone has already ended it.
      //
      // Safe to run in the same transition that just ended another workout:
      // the flush above already captured the outgoing maps by reference, so
      // replacing them here cannot take data out from under it.
      if (state.sessionId !== null) {
        hrBufferRef.current = new Map();
        energyBufferRef.current = new Map();
        bufferedSessionIdRef.current = state.sessionId;
        hasUnpostedRef.current = false;
        handledHrBatchClientIdsRef.current = new Set();
        entryDateRef.current =
          state.session?.entry_date != null
            ? normalizeDate(state.session.entry_date)
            : null;
      }
    });
  }, [enabled]);
}
