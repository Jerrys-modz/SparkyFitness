import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity, {
  type WatchRecordingControlPayload,
  type WatchRecordingHeartRatePayload,
  type WatchRecordingStatePayload,
} from '../../modules/watch-connectivity';
import {
  addHeartRateSamples,
  finishRecording,
  hydrate,
  pauseRecording,
  resumeRecording,
  useGpsRecording,
  type RecordingSnapshot,
} from '../services/gpsRecordingService';
import { addLog } from '../services/LogService';
import { notificationText } from '../utils/recordingNotification';
import {
  currentPaceSecondsPerUnit,
  METERS_PER_KM,
  METERS_PER_MILE,
  summarizeRecording,
} from '../utils/gpsRecording';
import { usePreferences } from './usePreferences';

/** How often the watch's distance and pace are refreshed while recording. */
const LIVE_STATS_INTERVAL_MS = 3000;

type WatchStatus = WatchRecordingStatePayload['status'];

/**
 * Ties the phone's GPS recording to the Apple Watch. The phone still records
 * the route; the watch shows time, distance and pace, can pause, resume or
 * finish, and streams heart rate, which is attached to the saved activity.
 *
 * Mounted headlessly (see `WatchWorkoutGate`), so controls from the wrist work
 * with the recording screen closed.
 */
export function useWatchRecordingBridge(enabled: boolean): void {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const unit: 'km' | 'mi' =
    preferences?.default_distance_unit === 'miles' ? 'mi' : 'km';
  const snapshot = useGpsRecording();
  const latest = useRef<RecordingSnapshot>(snapshot);
  const unitRef = useRef(unit);
  const tRef = useRef(t);
  // The last recording the watch was told about, so its end can be reported
  // after the session is gone from the store.
  const lastSent = useRef<{ id: string; status: WatchStatus } | null>(null);

  // Declared first so the effects below read the current render's values.
  useEffect(() => {
    latest.current = snapshot;
    unitRef.current = unit;
    tRef.current = t;
  });

  useEffect(() => {
    if (enabled) void hydrate();
  }, [enabled]);

  const buildState = (
    status: WatchStatus,
    snap: RecordingSnapshot
  ): WatchRecordingStatePayload | null => {
    const { session, points } = snap;
    if (!session) return null;
    const unitMeters =
      unitRef.current === 'mi' ? METERS_PER_MILE : METERS_PER_KM;
    const pace =
      status === 'recording'
        ? currentPaceSecondsPerUnit(points, unitMeters)
        : null;
    const state: WatchRecordingStatePayload = {
      sessionId: session.id,
      activity: session.activity,
      status,
      startedAt: session.startedAt,
      pausedMs: session.pausedMs,
      distanceMeters: Math.round(summarizeRecording(points).distanceMeters),
      distanceUnit: unitRef.current,
      sentAt: Date.now(),
    };
    if (session.status === 'paused' && session.pausedAt != null) {
      state.pausedAt = session.pausedAt;
    }
    if (status === 'finished') {
      // Frozen clock: the watch computes elapsed from these two.
      state.pausedAt = session.finishedAt ?? Date.now();
    }
    if (pace != null) state.paceSeconds = Math.round(pace);
    return state;
  };

  // A status change goes out durably; a recording that ends (saved or
  // discarded, so the session leaves the store) tells the watch to close.
  const sessionId = snapshot.session?.id ?? null;
  const status = snapshot.session?.status ?? null;
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const snap = latest.current;
    if (snap.session) {
      const state = buildState(snap.session.status, snap);
      if (!state) return;
      lastSent.current = { id: snap.session.id, status: snap.session.status };
      void WatchConnectivity.updateRecordingState(state, true).catch(
        (error: unknown) => logError('send state', error)
      );
    } else if (lastSent.current) {
      // Saved or discarded: the session left the store.
      endRecording(lastSent.current.id, unitRef.current);
      lastSent.current = null;
    }
  }, [enabled, sessionId, status]);

  // Live distance and pace, only while recording and only to a reachable watch.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || status !== 'recording') return;
    const timer = setInterval(() => {
      const snap = latest.current;
      const state = buildState('recording', snap);
      if (state && WatchConnectivity?.isReachable()) {
        void WatchConnectivity.updateRecordingState(state, false).catch(
          (error: unknown) => logError('send stats', error)
        );
      }
    }, LIVE_STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, status, sessionId]);

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const control = WatchConnectivity.addListener(
      'onRecordingControl',
      (payload: WatchRecordingControlPayload) => {
        const { session } = latest.current;
        if (!session || session.id !== payload.sessionId) return;
        const run =
          payload.action === 'pause'
            ? pauseRecording()
            : payload.action === 'resume'
              ? resumeRecording(
                  notificationText(tRef.current, session.activity)
                )
              : payload.action === 'finish'
                ? finishRecording()
                : null;
        run?.catch((error: unknown) => logError(payload.action, error));
      }
    );
    const heartRate = WatchConnectivity.addListener(
      'onRecordingHeartRate',
      (payload: WatchRecordingHeartRatePayload) => {
        const readings = (payload.samples ?? []).map((sample) => ({
          t: Date.parse(sample.t),
          bpm: sample.bpm,
        }));
        void addHeartRateSamples(
          payload.sessionId,
          payload.clientId,
          readings
        ).catch((error: unknown) => logError('store heart rate', error));
      }
    );
    return () => {
      control.remove();
      heartRate.remove();
    };
  }, [enabled]);
}

function endRecording(sessionId: string, unit: 'km' | 'mi'): void {
  void WatchConnectivity?.updateRecordingState(
    {
      sessionId,
      activity: 'walk',
      status: 'ended',
      startedAt: 0,
      pausedMs: 0,
      distanceMeters: 0,
      distanceUnit: unit,
      sentAt: Date.now(),
    },
    true
  ).catch((error: unknown) => logError('send end', error));
}

function logError(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  addLog(`[Watch Recording] Could not ${what}: ${message}`, 'WARNING');
}
