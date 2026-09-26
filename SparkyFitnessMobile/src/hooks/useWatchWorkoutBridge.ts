import { useCallback, useEffect, useRef } from 'react';
import WatchConnectivity, {
  type WatchSetCompletedPayload,
  type WatchHeartRateBatchPayload,
  type WatchWorkoutStopPayload,
} from '../../modules/watch-connectivity';
import {
  useActiveWorkoutStore,
  type ActiveSetPatch,
} from '../stores/activeWorkoutStore';
import { saveActiveWorkoutSession } from './useActiveWorkoutAutosave';
import { attachExerciseEntryWatchTelemetry } from '../services/api/exerciseApi';
import { ApiError } from '../services/api/errors';
import { addLog } from '../services/LogService';
import { queryClient } from './queryClient';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { normalizeDate } from '../utils/dateUtils';
import {
  attributeWatchBatch,
  boundedWatchCompletedAt,
} from '../utils/watchTelemetryAttribution';
import {
  buildWorkoutCelebration,
  type WorkoutCelebration,
} from '../utils/workoutCelebration';
import {
  mergeWatchTelemetry,
  readWatchTelemetry,
  writeWatchTelemetry,
  type WatchTelemetrySessionState,
} from '../utils/watchTelemetryPersistence';

type SessionTelemetry = WatchTelemetrySessionState;

// Long enough for the watch's queued final drain to land after the phone has
// moved on (it rides `transferUserInfo`, which can take minutes when the
// watch app is backgrounded), short enough that a stale session's buffers
// do not linger for the life of the app.
const ENDED_SESSION_RETENTION_MS = 10 * 60 * 1000;
// Live + the one just finished + one more, for "finish, start another,
// finish again" before the first drain arrives.
const MAX_TRACKED_SESSIONS = 3;
// 4xx answers that are about the request's circumstances, not its content,
// so the same telemetry will be accepted later: an expired session (the user
// signs back in), a timeout, or a rate limit from `authenticate`.
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 429]);

function createSessionTelemetry(entryDate: string | null): SessionTelemetry {
  return {
    samples: new Map(),
    energy: new Map(),
    durations: new Map(),
    durationFromTimeline: false,
    handledBatchClientIds: new Set(),
    entryDate,
    unposted: false,
    endedAt: null,
    attribution: null,
  };
}

function entryDateOf(
  session: { entry_date?: string | null } | null | undefined
): string | null {
  return session?.entry_date != null ? normalizeDate(session.entry_date) : null;
}

/** Exercise entries this phone has already bound to the session. */
function phoneOwnedEntryIds(
  session: SessionTelemetry,
  liveExercises: { id: string }[] | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const id of session.samples.keys()) ids.add(id);
  for (const id of session.energy.keys()) ids.add(id);
  for (const id of session.durations.keys()) ids.add(id);
  for (const step of session.attribution?.steps ?? []) {
    ids.add(step.exerciseEntryId);
  }
  for (const exercise of liveExercises ?? []) ids.add(exercise.id);
  return ids;
}

/** Set order → the exercise entry each set belongs to. */
function attributionSteps(state: {
  session: {
    type?: string;
    exercises?: { id: string; sets: { id: number | string }[] }[];
  } | null;
  steps: { setId: string }[];
}): { setId: string; exerciseEntryId: string }[] {
  const session = state.session;
  if (session == null || session.type !== 'preset' || !session.exercises) {
    return [];
  }
  const entryBySet = new Map<string, string>();
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      entryBySet.set(String(set.id), exercise.id);
    }
  }
  return state.steps.flatMap((step) => {
    const exerciseEntryId = entryBySet.get(step.setId);
    return exerciseEntryId ? [{ setId: step.setId, exerciseEntryId }] : [];
  });
}

/**
 * Bridges the Apple Watch's live workout tracking (Workout tab) to the
 * active-workout store and server.
 *
 * The watch never talks to the server itself — it only reports set
 * completions and heart-rate batches for whatever session
 * `useStartLiveWorkout` armed it with. A completed set is handed straight to
 * `useActiveWorkoutStore`'s own `completeSet`, which already owns rest
 * timers, PR detection and autosave dirtying for a phone-logged set — this
 * only adds the immediate flush a phone screen that isn't open would
 * otherwise wait on. Heart rate is buffered per session and exercise entry,
 * along with the active energy it measured (the watch closes a batch at every
 * exercise change, so each is tagged with the exercise it was measured
 * during), and attached once the workout ends — from either end, see
 * `flushHeartRate`. The measured energy replaces the server's
 * duration-and-sets calorie estimate for those entries.
 *
 * Buffers are kept per session, not just for the current one: the watch's
 * final drain is queued and routinely lands after the phone has ended the
 * workout, and sometimes after the next one has already started.
 *
 * `onWatchFinishedWorkout` fires when the WEARER ended the workout on the
 * watch and this hook cleared the phone's live session, with the completion
 * screen's params (null when there was nothing to celebrate). The caller owns
 * navigation — this hook is headless.
 *
 * iOS-only; a no-op everywhere else.
 */
export function useWatchWorkoutBridge(
  enabled: boolean,
  serverConnected: boolean = true,
  onTelemetryPendingChange?: (pending: boolean) => void,
  onWatchFinishedWorkout?: (celebration: WorkoutCelebration | null) => void
): void {
  const sessionsRef = useRef<Map<string, SessionTelemetry>>(new Map());
  const onPendingChangeRef = useRef(onTelemetryPendingChange);
  const onWatchFinishedRef = useRef(onWatchFinishedWorkout);
  const pendingRef = useRef(false);
  // Reports "anything, for any session, still waiting on the server" — the
  // caller polls the server connection while this is true.
  const syncPendingRef = useRef(() => {
    let pending = false;
    for (const session of sessionsRef.current.values()) {
      if (session.unposted) {
        pending = true;
        break;
      }
    }
    if (pendingRef.current === pending) return;
    pendingRef.current = pending;
    onPendingChangeRef.current?.(pending);
  });
  // Guards a queued setCompleted transfer being delivered (and thus
  // completeSet'd) twice — WatchConnectivity makes no once-only promise.
  const handledSetClientIdsRef = useRef<Set<string>>(new Set());
  // Points at `flushHeartRate` below, which the batch handler needs for a
  // late arrival but which is declared after it. Populated by the same effect
  // that syncs `handlersRef`, which runs before the listeners are attached.
  const flushHeartRateRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  // False until the saved buffer has been merged. A batch for a session that
  // is not live yet has to stay in the native queue so that replay can apply
  // it; acking it here drops samples the restore has not loaded.
  const restoredRef = useRef(false);

  // Drops ended sessions that have nothing left to post and are past the
  // retention window, then the oldest ended ones beyond the cap. A live
  // session is never dropped.
  const pruneSessions = useCallback((): void => {
    const sessions = sessionsRef.current;
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (
        session.endedAt != null &&
        !session.unposted &&
        now - session.endedAt > ENDED_SESSION_RETENTION_MS
      ) {
        sessions.delete(sessionId);
      }
    }
    if (sessions.size <= MAX_TRACKED_SESSIONS) return;
    const ended = [...sessions.entries()]
      .filter(([, session]) => session.endedAt != null)
      .sort(([, a], [, b]) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
    for (const [sessionId, session] of ended) {
      if (sessions.size <= MAX_TRACKED_SESSIONS) break;
      if (session.unposted) {
        addLog(
          `Dropping unposted watch telemetry for session ${sessionId}: more than ${MAX_TRACKED_SESSIONS} workouts are waiting on the server`,
          'WARNING'
        );
      }
      sessions.delete(sessionId);
    }
    syncPendingRef.current();
  }, []);

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

      state.completeSet(
        payload.setId,
        boundedWatchCompletedAt(
          payload.completedAt,
          state.startedAt,
          Date.now()
        )
      );
      // Flushed immediately rather than left to the debounced autosave: the
      // phone screen that normally drives that debounce may not even be
      // open while the wearer is logging entirely from the watch.
      await saveActiveWorkoutSession(queryClient);
    },
    []
  );

  const handleHeartRateBatch = useCallback(
    (payload: WatchHeartRateBatchPayload): void => {
      // A batch delivered while the saved buffer is still loading may already
      // be in that buffer. Mutating now lets mergeEnergy add it twice.
      // The native queue keeps it for the replay after the merge.
      if (!restoredRef.current) return;
      const ackId = payload.clientId || payload.queueId;
      const persistHeartRate = (): void => {
        // The map may hold only this batch. Writing it replaces the saved
        // buffer, and acking drops the native copy the restore still needs.
        if (!restoredRef.current) return;
        void writeWatchTelemetry(sessionsRef.current)
          .then(() => {
            if (!ackId) return undefined;
            return WatchConnectivity?.ackHeartRateBatches?.([ackId]);
          })
          .catch(() => {
            // Save or ack failed. The native queue still has the batch when
            // the ack did not land. A stored client id keeps its energy from
            // being added twice on the next launch.
          });
      };
      const acknowledgeDropped = (): void => {
        const ack = ackId
          ? WatchConnectivity?.ackHeartRateBatches?.([ackId])
          : undefined;
        if (ack) void ack.catch(() => undefined);
      };
      const liveState = useActiveWorkoutStore.getState();
      let session = sessionsRef.current.get(payload.sessionId);
      if (session == null) {
        const isLive = payload.sessionId === liveState.sessionId;
        if (!isLive) {
          // The saved buffer may not be merged yet, or the workout store may
          // still be rehydrating. Leave the batch queued until both are
          // done. Once they are, a session this phone never tracked is
          // dropped — the watch does not get to name an exercise entry.
          const storeReady =
            liveState.sessionId != null ||
            useActiveWorkoutStore.persist.hasHydrated();
          if (!restoredRef.current || !storeReady) return;
          addLog(
            `Watch heart-rate batch dropped: unknown session ${payload.sessionId}`,
            'WARNING',
            [
              `exerciseEntryId=${payload.exerciseEntryId}`,
              `samples=${payload.samples.length}`,
              `activeEnergyKcal=${payload.activeEnergyKcal ?? 'none'}`,
            ]
          );
          acknowledgeDropped();
          return;
        }
        session = createSessionTelemetry(entryDateOf(liveState.session));
        sessionsRef.current.set(payload.sessionId, session);
      }
      const owned = phoneOwnedEntryIds(
        session,
        payload.sessionId === liveState.sessionId
          ? liveState.session?.exercises
          : undefined
      );
      if (owned.size === 0) {
        addLog(
          `Watch heart-rate batch dropped: session ${payload.sessionId} has no phone-owned exercise`,
          'WARNING',
          [`exerciseEntryId=${payload.exerciseEntryId}`]
        );
        acknowledgeDropped();
        return;
      }
      if (payload.clientId) {
        if (session.handledBatchClientIds.has(payload.clientId)) {
          // Already applied. Ack only after this snapshot is stored, so a
          // kill during the original write still leaves the native queue.
          persistHeartRate();
          return;
        }
        session.handledBatchClientIds.add(payload.clientId);
      }
      // A drain that arrives after the phone ends the workout uses the copy
      // taken as the store was cleared. While the session is live, the store
      // itself is that copy.
      const live = payload.sessionId === liveState.sessionId ? liveState : null;
      const context = live
        ? {
            steps: attributionSteps(live),
            completedAtBySetId: live.completedSetIds,
            startedAt: live.startedAt,
            activeSetId: live.activeSetId,
            now: Date.now(),
          }
        : session.attribution
          ? {
              ...session.attribution,
              // The open exercise ends when the phone ended the workout, not
              // when this delayed batch happens to arrive.
              now: session.endedAt ?? Date.now(),
            }
          : null;
      const attributed = context
        ? attributeWatchBatch({
            samples: payload.samples,
            activeEnergyKcal: payload.activeEnergyKcal,
            taggedExerciseEntryId: payload.exerciseEntryId,
            steps: context.steps,
            completedAtBySetId: context.completedAtBySetId,
            startedAt: context.startedAt,
            activeSetId: context.activeSetId,
            now: context.now,
            forceTimeline: session.durationFromTimeline,
          })
        : null;
      const samplesByExercise =
        attributed?.samplesByExercise ??
        new Map([[payload.exerciseEntryId, payload.samples]]);
      for (const exerciseEntryId of [...samplesByExercise.keys()]) {
        if (!owned.has(exerciseEntryId))
          samplesByExercise.delete(exerciseEntryId);
      }
      const energyByExercise = attributed?.energyByExercise;
      if (energyByExercise) {
        for (const exerciseEntryId of [...energyByExercise.keys()]) {
          if (!owned.has(exerciseEntryId))
            energyByExercise.delete(exerciseEntryId);
        }
      }
      for (const [exerciseEntryId, incoming] of samplesByExercise) {
        if (incoming.length === 0) continue;
        const existing = session.samples.get(exerciseEntryId) ?? [];
        const seen = new Set(existing.map((sample) => sample.t));
        const added = incoming.filter(
          (sample) => sample?.t && !seen.has(sample.t)
        );
        if (added.length > 0) {
          session.samples.set(exerciseEntryId, existing.concat(added));
          session.unposted = true;
        }
      }
      // Energy is a delta. A redelivered batch without a clientId cannot be
      // distinguished from a new one, so skip calories rather than double
      // them. Samples still merge via the timestamp set above.
      if (payload.clientId && payload.activeEnergyKcal != null) {
        const shares =
          energyByExercise ??
          (owned.has(payload.exerciseEntryId)
            ? new Map([[payload.exerciseEntryId, payload.activeEnergyKcal]])
            : new Map());
        for (const [exerciseEntryId, kcal] of shares) {
          const existing = session.energy.get(exerciseEntryId) ?? 0;
          session.energy.set(exerciseEntryId, existing + kcal);
          session.unposted = true;
        }
      }
      if (attributed?.durationsByExercise) {
        session.durationFromTimeline = true;
        session.durations = new Map();
        for (const [
          exerciseEntryId,
          minutes,
        ] of attributed.durationsByExercise) {
          if (minutes > 0 && owned.has(exerciseEntryId))
            session.durations.set(exerciseEntryId, minutes);
        }
        session.unposted = true;
      } else if (
        !session.durationFromTimeline &&
        typeof payload.durationMinutes === 'number' &&
        payload.durationMinutes > 0
      ) {
        const previous = session.durations.get(payload.exerciseEntryId) ?? 0;
        if (
          payload.durationMinutes > previous &&
          owned.has(payload.exerciseEntryId)
        ) {
          session.durations.set(
            payload.exerciseEntryId,
            payload.durationMinutes
          );
          session.unposted = true;
        }
      }
      syncPendingRef.current();
      persistHeartRate();
      // Arrived after the workout already ended, so nothing else is coming to
      // trigger a flush — attach it now. This is the ordinary path for a
      // workout finished on the PHONE: the stop signal and the flush both go
      // out before the watch has had a chance to answer with its last minute.
      if (payload.sessionId !== liveState.sessionId) {
        void flushHeartRateRef.current();
      }
    },
    []
  );

  // Attaches everything buffered for every session that has something new,
  // and leaves the buffers intact. Safe to call repeatedly: a session with
  // nothing new since the last call costs nothing, which is what makes it
  // harmless for the watch's `workoutStop` to arrive after the phone has
  // already ended the same session itself. When something HAS arrived since
  // — the watch's final drain, typically — the re-post carries the whole
  // accumulated series rather than the tail, so the server recomputes
  // avg/max, calories and the zone rows over the full exercise instead of
  // overwriting them with its last minute.
  const flushHeartRate = useCallback(async (): Promise<void> => {
    for (const [sessionId, session] of [...sessionsRef.current.entries()]) {
      if (!session.unposted) continue;
      // Cleared up front so a batch arriving mid-flush re-arms it rather than
      // being marked posted by this pass, which never saw it.
      session.unposted = false;

      // One post per exercise entry carrying whichever of the two the watch
      // actually produced, so an entry with energy but no usable series still
      // gets its measured calories.
      const entryIds = new Set([
        ...session.samples.keys(),
        ...session.energy.keys(),
        ...session.durations.keys(),
      ]);
      for (const exerciseEntryId of entryIds) {
        const samples = session.samples.get(exerciseEntryId) ?? [];
        const kcal = session.energy.get(exerciseEntryId);
        const minutes = session.durations.get(exerciseEntryId);
        // The zone calculator needs at least two samples to derive a duration
        // between them; a lone reading has nothing to attach, and the server
        // rejects a one-sample series outright.
        const hrSamples = samples.length >= 2 ? samples : undefined;
        const durationMinutes =
          minutes != null && minutes > 0 ? minutes : undefined;
        // All absent means there is nothing to say; the server rejects that
        // body, so don't spend a request discovering it.
        if (!hrSamples && kcal == null && durationMinutes == null) continue;
        try {
          await attachExerciseEntryWatchTelemetry(exerciseEntryId, {
            ...(hrSamples ? { hrSamples } : {}),
            ...(kcal != null ? { activeEnergyKcal: kcal } : {}),
            ...(durationMinutes != null ? { durationMinutes } : {}),
          });
        } catch (error) {
          const status =
            error instanceof ApiError ? error.statusCode : undefined;
          if (
            status != null &&
            status >= 400 &&
            status < 500 &&
            !RETRYABLE_CLIENT_STATUSES.has(status)
          ) {
            // The server will refuse this entry however often it is asked
            // (deleted entry → 404, malformed or oversized series → 400), and
            // retrying would keep the connection poll alive for nothing.
            session.samples.delete(exerciseEntryId);
            session.energy.delete(exerciseEntryId);
            session.durations.delete(exerciseEntryId);
            addLog(
              `Dropped watch telemetry for exercise entry ${exerciseEntryId}: server rejected it (${status})`,
              'WARNING',
              [`sessionId=${sessionId}`, String(error)]
            );
            continue;
          }
          // Offline, a server fault, or a retryable 4xx: left dirty so the
          // next flush retries.
          // The buffer still holds every sample, so that retry posts the full
          // series, not a remnant of it.
          session.unposted = true;
          addLog(
            `Failed to attach watch telemetry to exercise entry ${exerciseEntryId}: ${String(error)}`,
            'ERROR'
          );
        }
      }
      if (session.entryDate) {
        invalidateExerciseCache(queryClient, session.entryDate);
      }
    }
    syncPendingRef.current();
    pruneSessions();
    // Before restore finishes, the map does not yet hold the saved buffer.
    // An empty write would delete that ciphertext.
    if (restoredRef.current) {
      void writeWatchTelemetry(sessionsRef.current).catch(() => undefined);
    }
  }, [pruneSessions]);

  const handleWorkoutStop = useCallback(
    async (payload: WatchWorkoutStopPayload): Promise<void> => {
      await flushHeartRate();
      const state = useActiveWorkoutStore.getState();
      if (state.sessionId !== payload.sessionId) {
        // Already ended on the phone (the usual race), or a stop queued for a
        // workout that has since been replaced.
        addLog(
          `Watch workout-stop ignored: session ${payload.sessionId} is not the live one`,
          'DEBUG'
        );
        return;
      }
      // Finishing on the watch ends the phone's live session too, the same
      // way the phone's own Finish does: flush any dirty sets, snapshot the
      // completion screen's params before the store empties, then clear.
      const outcome = await saveActiveWorkoutSession(queryClient);
      if (outcome === 'failed') {
        // Clearing now would throw away sets the server never received. Keep
        // the session live so the wearer can finish it on the phone, whose
        // Finish flow retries the save.
        addLog(
          `Watch finish kept the phone workout open: saving session ${payload.sessionId} failed`,
          'WARNING'
        );
        return;
      }
      const celebration = buildWorkoutCelebration(
        useActiveWorkoutStore.getState()
      );
      useActiveWorkoutStore.getState().clearWorkout();
      onWatchFinishedRef.current?.(celebration);
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
    onPendingChangeRef.current = onTelemetryPendingChange;
    onWatchFinishedRef.current = onWatchFinishedWorkout;
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

  // A batch can arrive before this hook is listening, and the in-memory
  // buffer dies with the process. The native queue and the saved buffer
  // cover those two gaps. Listeners are attached above, synchronously, so
  // this restore cannot miss one that lands while storage is being read.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;
    let cancelled = false;
    let stopHydration: (() => void) | undefined;
    restoredRef.current = false;
    void (async () => {
      let saved: Awaited<ReturnType<typeof readWatchTelemetry>>;
      try {
        saved = await readWatchTelemetry(createSessionTelemetry);
      } catch (error) {
        // A failed read must not replay or ack the native queue. Those
        // batches are the copy that survives until storage works again.
        addLog(
          `Watch telemetry restore failed; native queue left for retry: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'WARNING'
        );
        return;
      }
      if (cancelled) return;
      const shouldFlush = mergeWatchTelemetry(
        sessionsRef.current,
        saved,
        createSessionTelemetry
      );
      const liveId = useActiveWorkoutStore.getState().sessionId;
      for (const [sessionId, session] of sessionsRef.current) {
        if (sessionId === liveId) {
          session.endedAt = null;
        } else if (session.endedAt == null) {
          // Killed while this workout was live, or replayed from the native
          // queue. Leaving endedAt null makes pruning treat it as live.
          session.endedAt = Date.now();
        }
      }
      if (cancelled) return;
      restoredRef.current = true;
      // Persist the merged buffer before replay. A batch still in the native
      // queue is applied by that replay, which writes again once stored.
      void writeWatchTelemetry(sessionsRef.current).catch(() => undefined);
      if (shouldFlush) {
        syncPendingRef.current();
        void handlersRef.current.flushHeartRate();
      }
      const replayPending = async (): Promise<void> => {
        if (cancelled || !WatchConnectivity) return;
        if (typeof WatchConnectivity.pendingHeartRateBatches !== 'function')
          return;
        const pending = await WatchConnectivity.pendingHeartRateBatches();
        if (cancelled) return;
        for (const batch of pending) {
          handlersRef.current.handleHeartRateBatch(batch);
        }
      };
      await replayPending();
      // A queued batch for the workout that is about to rehydrate has to
      // wait until the phone's session id is known. It is not applied to a
      // watch-supplied entry in the meantime.
      if (!cancelled && !useActiveWorkoutStore.persist.hasHydrated()) {
        stopHydration = useActiveWorkoutStore.persist.onFinishHydration(() => {
          stopHydration?.();
          void replayPending();
        });
      }
    })();
    return () => {
      cancelled = true;
      stopHydration?.();
    };
  }, [enabled]);

  // Listeners stay on while offline so batches are not dropped. Attach
  // cannot succeed until the API is reachable, so retry the buffered series
  // the moment the server comes back.
  useEffect(() => {
    if (!enabled || !serverConnected) return;
    void handlersRef.current.flushHeartRate();
  }, [enabled, serverConnected]);

  // The other way a workout ends: the wearer finished (or discarded) it on
  // the PHONE. The watch has no idea that happened, so without this it keeps
  // an HKWorkoutSession running against a closed session and every sample it
  // captured sits in the buffer until the app is killed. Watching the store
  // rather than hooking the finish screen catches every exit — finish,
  // discard, and "Clear & Start" superseding one workout with another.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;

    // A newly live session is tracked from the moment it starts rather than
    // when its first batch arrives, so a workout too short to have produced
    // one (they are a minute apart) still has its session recognised when
    // the final drain shows up after the phone has already ended it.
    const track = (
      sessionId: string,
      session: { entry_date?: string | null } | null | undefined
    ): void => {
      const existing = sessionsRef.current.get(sessionId);
      if (existing) {
        // Restore may have marked it ended before the store rehydrated.
        if (existing.endedAt != null) {
          existing.endedAt = null;
          void writeWatchTelemetry(sessionsRef.current).catch(() => undefined);
        }
        return;
      }
      sessionsRef.current.set(
        sessionId,
        createSessionTelemetry(entryDateOf(session))
      );
      pruneSessions();
    };

    const current = useActiveWorkoutStore.getState();
    if (current.sessionId != null) track(current.sessionId, current.session);

    return useActiveWorkoutStore.subscribe((state, prevState) => {
      if (state.sessionId === prevState.sessionId) return;
      const ended = prevState.sessionId;
      if (ended !== null) {
        const endedSession = sessionsRef.current.get(ended);
        if (endedSession) {
          endedSession.endedAt = Date.now();
          endedSession.attribution = {
            steps: attributionSteps(prevState),
            completedAtBySetId: { ...prevState.completedSetIds },
            startedAt: prevState.startedAt,
            activeSetId: prevState.activeSetId,
          };
        }
        void WatchConnectivity?.stopWorkout(ended, new Date().toISOString());
        // Posts what has arrived so far. The watch answers that stop signal
        // with its own final drain, which lands afterwards and re-posts the
        // completed series — see `handleHeartRateBatch`.
        void handlersRef.current.flushHeartRate();
      }
      if (state.sessionId !== null) track(state.sessionId, state.session);
    });
  }, [enabled, pruneSessions]);
}
