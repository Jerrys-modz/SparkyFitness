import { useEffect, useRef } from 'react';
import LiveHeartRateModule from '../../modules/live-heart-rate';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useLiveHeartRateStore } from '../stores/liveHeartRateStore';
import { addLog } from '../services/LogService';
import {
  getGpsRecordingSnapshot,
  subscribeGpsRecording,
} from '../services/gpsRecordingService';
import { useWatchRunLiveStore } from '../stores/watchRunLiveStore';

/**
 * A run or walk is being recorded (on the phone with GPS, or on the watch).
 * Those own the heart rate and energy sensors, and a second workout session on
 * the phone must never run beside them, so the headphone session stands down.
 */
function anotherRecordingActive(): boolean {
  return (
    getGpsRecordingSnapshot().session != null ||
    useWatchRunLiveStore.getState().run != null
  );
}

/** How long a paired watch has to be heard before the phone steps in. */
export const WATCH_SILENT_GRACE_MS = 30_000;

/**
 * The exercise entry the live workout is on: the one that holds the active
 * set. Null once the workout has no set left to do.
 */
export function currentExerciseEntryId(state: {
  activeSetId: string | null;
  session: {
    exercises?: { id: string; sets: { id: number | string }[] }[];
  } | null;
}): string | null {
  const { activeSetId, session } = state;
  if (activeSetId == null || !session?.exercises) return null;
  const exercise = session.exercises.find((candidate) =>
    candidate.sets.some((set) => String(set.id) === activeSetId)
  );
  return exercise ? String(exercise.id) : null;
}

/**
 * Live heart rate from the phone itself, for headphones with a sensor (AirPods
 * Pro 3). While a workout is live the phone runs a workout session, which is
 * what makes iOS hand it the headphones' readings, and each reading goes to the
 * same store the watch feeds, and to `onSample` so the workout's upload buffer
 * keeps it. With no watch paired it starts with the workout. With a watch
 * paired the watch owns the workout's heart rate: the phone waits
 * `WATCH_SILENT_GRACE_MS` and starts only if the watch has sent nothing (left
 * at home, not worn), then hands back the moment the watch is heard. Does
 * nothing on Android or before iOS 26.
 */
export function usePhoneHeartRate(
  watchPaired: boolean,
  onSample?: (sessionId: string, sample: { t: string; bpm: number }) => void
): void {
  const onSampleRef = useRef(onSample);
  useEffect(() => {
    onSampleRef.current = onSample;
  });
  useEffect(() => {
    const native = LiveHeartRateModule;
    if (!native || !native.isAvailable()) return;

    let running = false;
    // Each start/stop pair gets a token so a slow start that finishes after
    // the workout ended closes itself instead of leaving a session open.
    let generation = 0;
    // A reading from the watch for the live workout: it owns heart rate.
    let watchHeard = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const begin = (): void => {
      if (running || watchHeard || anotherRecordingActive()) return;
      running = true;
      const mine = ++generation;
      native
        .start()
        .then((started) => {
          if (!started) {
            if (mine === generation) running = false;
            return;
          }
          if (mine !== generation) void native.stop().catch(() => undefined);
        })
        .catch((error: unknown) => {
          if (mine === generation) running = false;
          addLog('Phone heart-rate session failed to start', 'WARNING', [
            String(error),
          ]);
        });
    };
    const end = (): void => {
      if (!running) return;
      running = false;
      generation += 1;
      void native.stop().catch(() => undefined);
    };

    const readingSub = native.addListener('onHeartRate', (reading) => {
      const state = useActiveWorkoutStore.getState();
      if (state.sessionId == null || watchHeard) return;
      if (!(reading.bpm > 0) || !Number.isFinite(reading.at)) return;
      const exerciseEntryId = currentExerciseEntryId(state);
      if (exerciseEntryId == null) return;
      useLiveHeartRateStore.getState().record({
        sessionId: state.sessionId,
        exerciseEntryId,
        bpm: Math.round(reading.bpm),
        at: reading.at,
        source: 'phone',
      });
      onSampleRef.current?.(state.sessionId, {
        t: new Date(reading.at).toISOString(),
        bpm: Math.round(reading.bpm),
      });
    });
    // iOS ended the session itself (another app took the sensor, say). Allow
    // a fresh start the next time the workout store changes.
    const stoppedSub = native.addListener('onStopped', () => {
      running = false;
      generation += 1;
    });

    const clearGrace = (): void => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = undefined;
    };
    const sync = (sessionId: string | null): void => {
      clearGrace();
      watchHeard = false;
      if (sessionId == null) {
        end();
        return;
      }
      if (!watchPaired) {
        begin();
        return;
      }
      graceTimer = setTimeout(() => {
        graceTimer = undefined;
        if (useActiveWorkoutStore.getState().sessionId === sessionId) begin();
      }, WATCH_SILENT_GRACE_MS);
    };
    sync(useActiveWorkoutStore.getState().sessionId);
    const unsubscribe = useActiveWorkoutStore.subscribe((state, previous) => {
      if (state.sessionId !== previous.sessionId) sync(state.sessionId);
    });
    // A run or walk starting takes the sensors from the phone's session; when
    // it is over, a workout that is still live gets its session back.
    let blocked = anotherRecordingActive();
    const reevaluate = (): void => {
      const now = anotherRecordingActive();
      if (now === blocked) return;
      blocked = now;
      if (blocked) {
        clearGrace();
        end();
        return;
      }
      const sessionId = useActiveWorkoutStore.getState().sessionId;
      if (sessionId != null) sync(sessionId);
    };
    const unsubscribeGps = subscribeGpsRecording(reevaluate);
    const unsubscribeRun = useWatchRunLiveStore.subscribe(reevaluate);
    // The watch sent a reading for this workout: it owns heart rate, so the
    // phone's session (if it had started) closes and none starts later.
    const unsubscribeWatch = useLiveHeartRateStore.subscribe((state) => {
      const reading = state.reading;
      if (
        reading == null ||
        reading.source === 'phone' ||
        reading.sessionId !== useActiveWorkoutStore.getState().sessionId
      ) {
        return;
      }
      watchHeard = true;
      clearGrace();
      end();
    });

    return () => {
      unsubscribe();
      unsubscribeWatch();
      unsubscribeGps();
      unsubscribeRun();
      clearGrace();
      readingSub.remove();
      stoppedSub.remove();
      end();
    };
  }, [watchPaired]);
}
