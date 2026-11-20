import type { IndividualSessionResponse } from '@workspace/shared';
import { toLocalDateString } from '../utils/dateUtils';
import { METERS_PER_KM, summarizeRecording } from '../utils/gpsRecording';
import {
  EXERCISE_NAMES,
  INDOOR_ENTRY_NAMES,
  estimateRecordingCalories,
} from '../utils/recordingEntry';
import {
  watchRunActivity,
  watchRunPoints,
  type WatchRunPayload,
} from '../utils/watchRun';
import type { QueuedRecordingPayload } from './runHandOver';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The diary entry the server will make of a run saved on the phone, built
 * from the saved recording, so the offline Diary can show it before it has
 * uploaded. Calories are the rough per-hour figure; the server's own estimate
 * replaces it once the run is uploaded.
 */
export function buildLocalRun(
  payload: QueuedRecordingPayload
): IndividualSessionResponse {
  const { session } = payload;
  const indoor = session.indoor === true;
  const started = new Date(session.startedAt);
  const end = session.finishedAt ?? session.startedAt;
  const seconds = Math.max(
    1,
    Math.round((end - session.startedAt - session.pausedMs) / 1000)
  );
  const minutes = Math.round((seconds / 60) * 100) / 100;
  const distanceKm = indoor
    ? payload.indoorDistanceKm != null && payload.indoorDistanceKm > 0
      ? Math.round(payload.indoorDistanceKm * 1000) / 1000
      : null
    : Math.round(summarizeRecording(payload.points).distanceMeters) /
      METERS_PER_KM;
  const heartRates = payload.heartRate.map((sample) => sample.bpm);
  const name = indoor
    ? INDOOR_ENTRY_NAMES[session.activity]
    : EXERCISE_NAMES[session.activity];
  return {
    type: 'individual',
    id: payload.entryId,
    name,
    exercise_id: null,
    duration_minutes: minutes,
    calories_burned: estimateRecordingCalories(session.activity, minutes),
    entry_date: toLocalDateString(started),
    entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
    notes: null,
    distance: distanceKm,
    avg_heart_rate:
      heartRates.length > 0
        ? Math.round(
            heartRates.reduce((sum, bpm) => sum + bpm, 0) / heartRates.length
          )
        : null,
    source: 'Manual',
    sets: [],
    exercise_snapshot: null,
    activity_details: [],
    superset_group: null,
    category: 'cardio',
  };
}

/**
 * The diary entry the server will make of a run the watch recorded alone,
 * for the offline Diary to show while it waits to be filed. Mirrors what
 * `saveWatchRun` creates; the server's own calorie estimate replaces ours.
 */
export function buildLocalWatchRun(
  payload: WatchRunPayload,
  entryId: string
): IndividualSessionResponse {
  const activity = watchRunActivity(payload);
  const started = new Date(payload.startedAt);
  const seconds = Math.max(
    1,
    Math.round(
      payload.activeSeconds > 0
        ? payload.activeSeconds
        : (payload.endedAt - payload.startedAt) / 1000
    )
  );
  const minutes = Math.round((seconds / 60) * 100) / 100;
  const points = watchRunPoints(payload);
  const routeMeters =
    points.length >= 2 ? summarizeRecording(points).distanceMeters : 0;
  const distanceMeters =
    payload.distanceMeters > 0 ? payload.distanceMeters : routeMeters;
  const heartRates = payload.heartRate.map(([, bpm]) => bpm);
  return {
    type: 'individual',
    id: entryId,
    name: EXERCISE_NAMES[activity],
    exercise_id: null,
    duration_minutes: minutes,
    calories_burned:
      payload.activeEnergyKcal > 0
        ? Math.round(payload.activeEnergyKcal)
        : estimateRecordingCalories(activity, minutes),
    entry_date: toLocalDateString(started),
    entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
    notes: null,
    distance:
      payload.kind === 'jumpRope'
        ? null
        : Math.round(distanceMeters) / METERS_PER_KM,
    avg_heart_rate:
      heartRates.length > 0
        ? Math.round(
            heartRates.reduce((sum, bpm) => sum + bpm, 0) / heartRates.length
          )
        : null,
    source: 'Manual',
    sets: [],
    exercise_snapshot: null,
    activity_details: [],
    superset_group: null,
    category: 'cardio',
  };
}
