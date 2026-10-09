import type { Exercise } from '../types/exercise';
import {
  attachExerciseEntryGpsTrack,
  attachExerciseEntryWatchTelemetry,
  createExercise,
  createExerciseEntry,
  searchExercises,
} from './api/exerciseApi';
import {
  elapsedSeconds,
  getHeartRateSamples,
  markRecordingSaved,
  type RecordingSession,
} from './gpsRecordingService';
import { addLog } from './LogService';
import { buildActivitySetsPayload } from '../utils/workoutSession';
import { toLocalDateString } from '../utils/dateUtils';
import {
  computeLaps,
  computeSplits,
  METERS_PER_KM,
  METERS_PER_MILE,
  splitsToLapWindows,
  summarizeRecording,
  toWorkoutGpsPoints,
  type RecordedPoint,
  type RecordingActivity,
} from '../utils/gpsRecording';

/** Library names the three activities are logged under. */
const EXERCISE_NAMES: Record<RecordingActivity, string> = {
  walk: 'Walking',
  run: 'Running',
  ride: 'Cycling',
};

// Only used when the library has no exercise of that name, so the entry still
// gets a calorie estimate. Rough figures for an average adult.
const FALLBACK_CALORIES_PER_HOUR: Record<RecordingActivity, number> = {
  walk: 250,
  run: 600,
  ride: 450,
};

/**
 * Finds the library exercise a recording is logged against, creating a cardio
 * one when the library has none of that name.
 */
export async function resolveRecordingExercise(
  activity: RecordingActivity
): Promise<Exercise> {
  const name = EXERCISE_NAMES[activity];
  const matches = (await searchExercises(name)).filter(
    (exercise) => exercise.name.trim().toLowerCase() === name.toLowerCase()
  );
  const best =
    matches.find((exercise) => exercise.modality === 'duration_distance') ??
    matches[0];
  if (best) return best;
  return createExercise({
    name,
    category: 'cardio',
    modality: 'duration_distance',
    calories_per_hour: FALLBACK_CALORIES_PER_HOUR[activity],
    description: null,
  });
}

const pad = (value: number) => String(value).padStart(2, '0');

export interface SavedRecording {
  entryId: string;
  entryDate: string;
}

/**
 * Saves a finished recording to the diary: the activity entry first, then its
 * route and splits. If the second step fails the entry id is kept on the
 * session, so retrying only re-sends the track (the server replaces it) and
 * never logs the activity twice.
 */
export async function saveRecordedActivity(
  session: RecordingSession,
  points: readonly RecordedPoint[],
  distanceUnit: 'km' | 'miles'
): Promise<SavedRecording> {
  const summary = summarizeRecording(points);
  const started = new Date(session.startedAt);
  const entryDate = toLocalDateString(started);
  const durationSeconds = Math.max(1, Math.round(elapsedSeconds(session)));
  const distanceKm = Math.round(summary.distanceMeters) / METERS_PER_KM;

  let entryId = session.savedEntryId;
  if (!entryId) {
    const exercise = await resolveRecordingExercise(session.activity);
    const created = await createExerciseEntry({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      duration_minutes: Math.round((durationSeconds / 60) * 100) / 100,
      entry_date: entryDate,
      entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
      distance: distanceKm,
      sets: buildActivitySetsPayload([], new Map(), 'kg', 'duration_distance', {
        durationSec: durationSeconds,
        distanceKm,
      }),
    });
    entryId = created.id;
    await markRecordingSaved(entryId);
  }

  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  await attachExerciseEntryGpsTrack(entryId, {
    points: toWorkoutGpsPoints(points),
    // Laps the person marked replace the automatic splits: they are the
    // intervals they meant to compare.
    laps: splitsToLapWindows(
      session.laps && session.laps.length > 0
        ? computeLaps(points, session.laps)
        : computeSplits(points, unitMeters)
    ),
  });
  await attachWatchHeartRate(entryId);
  return { entryId, entryDate };
}

/**
 * Fills in heart rate from the watch (avg/max and zones) on the saved entry.
 * Best effort: the activity and its route are already stored, so a failure
 * here is logged and never blocks the save.
 */
async function attachWatchHeartRate(entryId: string): Promise<void> {
  try {
    const samples = await getHeartRateSamples();
    // The server needs two readings to measure any time in a zone.
    if (samples.length < 2) return;
    await attachExerciseEntryWatchTelemetry(entryId, {
      hrSamples: samples.map((sample) => ({
        t: new Date(sample.t).toISOString(),
        bpm: sample.bpm,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not attach watch heart rate: ${message}`,
      'WARNING'
    );
  }
}
