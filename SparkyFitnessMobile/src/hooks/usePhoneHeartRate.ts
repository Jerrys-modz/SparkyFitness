import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import LiveHeartRateModule from '../../modules/live-heart-rate';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  LIVE_HEART_RATE_MAX_AGE_MS,
  useLiveHeartRateStore,
} from '../stores/liveHeartRateStore';
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

/**
 * How long the watch can go without a reading before the phone's headphones
 * take over, and how long a reading counts as the watch still being on. Live
 * readings arrive every few seconds and a queued batch's newest sample is under
 * a minute old, so this rides out a late batch without leaving a gap.
 */
export const WATCH_SILENT_GRACE_MS = 45_000;
/** How often the live workout re-checks who should be measuring. */
const SOURCE_CHECK_MS = 10_000;
/** Refusals in a row (Health access denied, no session allowed) before giving up for the workout. */
const MAX_START_FAILURES = 3;

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
 * keeps it.
 *
 * Like Apple's own apps, it uses whichever device has recent readings: with no
 * watch paired the phone measures from the start; with a watch it measures only
 * while the watch has been silent for `WATCH_SILENT_GRACE_MS` (left at home,
 * taken off, out of range), and hands back the moment the watch is heard. Apple
 * ranks sources by how accurate the last 5 minutes were, which the app cannot
 * see, so "recent readings" stands in for it. The phone's session survives a
 * kill (`recover`) and its readings are kept natively (`drain`) for when the
 * phone locks. Does nothing on Android or before iOS 26.
 */
export function usePhoneHeartRate(
  watchPaired: boolean,
  onSample?: (sessionId: string, sample: { t: string; bpm: number }) => void
): void {
  const enabled = useAppPreferencesStore((s) => s.phoneHeartRateEnabled);
  const onSampleRef = useRef(onSample);
  useEffect(() => {
    onSampleRef.current = onSample;
  });
  useEffect(() => {
    const native = LiveHeartRateModule;
    if (!enabled || !native || !native.isAvailable()) return;

    let running = false;
    let cancelled = false;
    // False until a session left by a killed app has been adopted or ruled
    // out, so a fresh one is never started beside it.
    let ready = false;
    // Each start/stop pair gets a token so a slow start that finishes after
    // the workout ended closes itself instead of leaving a session open.
    let generation = 0;
    // When the watch last gave a reading for the live workout (its time, not
    // when it arrived), or null when it has not.
    let lastWatchAt: number | null = null;
    // Starts that came back false in a row; reset when a workout begins.
    let failedStarts = 0;
    let sourceTimer: ReturnType<typeof setInterval> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const watchActive = (): boolean =>
      lastWatchAt != null && Date.now() - lastWatchAt < WATCH_SILENT_GRACE_MS;

    const begin = (): void => {
      if (
        !ready ||
        running ||
        failedStarts >= MAX_START_FAILURES ||
        watchActive() ||
        anotherRecordingActive()
      ) {
        return;
      }
      running = true;
      const mine = ++generation;
      native
        .start()
        .then((started) => {
          if (!started) {
            // A start that was cancelled by an end() is not a refusal.
            if (mine !== generation) return;
            running = false;
            failedStarts += 1;
            if (failedStarts === 1) {
              addLog(
                'Phone heart-rate session was not started (Health access refused or no session allowed)',
                'WARNING'
              );
            }
            return;
          }
          failedStarts = 0;
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

    const handleReading = (reading: { bpm: number; at: number }): void => {
      const state = useActiveWorkoutStore.getState();
      if (state.sessionId == null || watchActive()) return;
      if (!(reading.bpm > 0) || !Number.isFinite(reading.at)) return;
      // The live chip only shows a fresh reading: one caught up after the
      // phone was locked belongs to the past and goes to the upload buffer.
      const exerciseEntryId = currentExerciseEntryId(state);
      if (
        exerciseEntryId != null &&
        Date.now() - reading.at <= LIVE_HEART_RATE_MAX_AGE_MS
      ) {
        useLiveHeartRateStore.getState().record({
          sessionId: state.sessionId,
          exerciseEntryId,
          bpm: Math.round(reading.bpm),
          at: reading.at,
          source: 'phone',
        });
      }
      onSampleRef.current?.(state.sessionId, {
        t: new Date(reading.at).toISOString(),
        bpm: Math.round(reading.bpm),
      });
    };
    // Readings the phone took while JS was not running (it locks between sets).
    // Already-seen ones are dropped by the store and the upload buffer.
    const drainReadings = (): void => {
      if (!running) return;
      try {
        for (const reading of native.drain()) handleReading(reading);
      } catch {
        // A failed catch-up costs nothing: the next one retries.
      }
    };

    const readingSub = native.addListener('onHeartRate', handleReading);
    // iOS ended the session itself (another app took the sensor, say). Allow
    // a fresh start on the next check.
    const stoppedSub = native.addListener('onStopped', () => {
      running = false;
      generation += 1;
    });

    const clearTimers = (): void => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = undefined;
      if (sourceTimer) clearInterval(sourceTimer);
      sourceTimer = undefined;
    };
    // Who should be measuring right now: the phone only while the watch is not.
    const check = (): void => {
      if (useActiveWorkoutStore.getState().sessionId == null) return;
      if (anotherRecordingActive() || watchActive()) end();
      else begin();
      drainReadings();
    };
    const sync = (sessionId: string | null): void => {
      clearTimers();
      lastWatchAt = null;
      failedStarts = 0;
      if (sessionId == null) {
        end();
        return;
      }
      // With a watch paired it gets a head start; the phone steps in only if it
      // stays silent.
      if (!watchPaired) begin();
      else {
        graceTimer = setTimeout(() => {
          graceTimer = undefined;
          check();
        }, WATCH_SILENT_GRACE_MS);
      }
      sourceTimer = setInterval(check, SOURCE_CHECK_MS);
    };

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
      check();
    };
    const unsubscribeGps = subscribeGpsRecording(reevaluate);
    const unsubscribeRun = useWatchRunLiveStore.subscribe(reevaluate);
    // The watch gave a reading for this workout: remember when it measured it.
    // The phone's session closes on the next check if that stays recent.
    const unsubscribeWatch = useLiveHeartRateStore.subscribe((state) => {
      const reading = state.reading;
      if (
        reading == null ||
        reading.source === 'phone' ||
        reading.sessionId !== useActiveWorkoutStore.getState().sessionId
      ) {
        return;
      }
      lastWatchAt = Math.max(lastWatchAt ?? 0, reading.at);
      if (watchActive()) end();
    });
    // Back from a locked phone: catch up on what was measured meanwhile.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });

    // A phone session iOS kept alive through a kill is taken over if a workout
    // is still live, and ended if not, before anything new starts.
    void (async () => {
      try {
        const recovered = await native.recover();
        if (cancelled) {
          if (recovered) await native.stop();
          return;
        }
        if (recovered) {
          if (useActiveWorkoutStore.getState().sessionId != null) {
            running = true;
          } else {
            await native.stop();
          }
        }
      } catch (error) {
        addLog('Phone heart-rate session recovery failed', 'WARNING', [
          String(error),
        ]);
      }
      if (cancelled) return;
      ready = true;
      sync(useActiveWorkoutStore.getState().sessionId);
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeWatch();
      unsubscribeGps();
      unsubscribeRun();
      appStateSub.remove();
      clearTimers();
      readingSub.remove();
      stoppedSub.remove();
      end();
    };
  }, [watchPaired, enabled]);
}
