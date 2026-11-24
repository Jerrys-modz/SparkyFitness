import { useEffect } from 'react';
import LiveHeartRateModule from '../../modules/live-heart-rate';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useLiveHeartRateStore } from '../stores/liveHeartRateStore';
import { addLog } from '../services/LogService';

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
 * same store the watch feeds. Does nothing when a watch is paired (the watch
 * owns the workout's heart rate), on Android, or before iOS 26.
 */
export function usePhoneHeartRate(enabled: boolean): void {
  useEffect(() => {
    const native = LiveHeartRateModule;
    if (!enabled || !native || !native.isAvailable()) return;

    let running = false;
    // Each start/stop pair gets a token so a slow start that finishes after
    // the workout ended closes itself instead of leaving a session open.
    let generation = 0;

    const begin = (): void => {
      if (running) return;
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
      if (state.sessionId == null) return;
      if (!(reading.bpm > 0) || !Number.isFinite(reading.at)) return;
      const exerciseEntryId = currentExerciseEntryId(state);
      if (exerciseEntryId == null) return;
      useLiveHeartRateStore.getState().record({
        sessionId: state.sessionId,
        exerciseEntryId,
        bpm: Math.round(reading.bpm),
        at: reading.at,
      });
    });
    // iOS ended the session itself (another app took the sensor, say). Allow
    // a fresh start the next time the workout store changes.
    const stoppedSub = native.addListener('onStopped', () => {
      running = false;
      generation += 1;
    });

    const sync = (sessionId: string | null): void => {
      if (sessionId != null) begin();
      else end();
    };
    sync(useActiveWorkoutStore.getState().sessionId);
    const unsubscribe = useActiveWorkoutStore.subscribe((state, previous) => {
      if (state.sessionId !== previous.sessionId) sync(state.sessionId);
    });

    return () => {
      unsubscribe();
      readingSub.remove();
      stoppedSub.remove();
      end();
    };
  }, [enabled]);
}
