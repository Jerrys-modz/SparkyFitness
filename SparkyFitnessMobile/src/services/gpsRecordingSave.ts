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
  peekAppleWorkoutZones,
  clearAppleWorkoutZones,
  type RecordedHeartRate,
  type RecordingSession,
} from './gpsRecordingService';
import { serverMayBeDown } from '../utils/serverErrors';
import { addLog } from './LogService';
import {
  learnFromIndoorEntry,
  learnFromOutdoorRecording,
  measureOutdoorForm,
  type IndoorDistanceEstimate,
} from './stepDistance';
import { computeFormMetrics, type FormMetrics } from '../utils/stride';
import { assignShoeToExerciseEntry, fetchShoes } from './api/shoesApi';
import { findShoeThatReachedLimit } from './shoeWear';
import type { AppleWorkoutZoneDuration, ShoeResponse } from '@workspace/shared';
import {
  EXERCISE_NAMES,
  FALLBACK_CALORIES_PER_HOUR,
  INDOOR_ENTRY_NAMES,
} from '../utils/recordingEntry';
import { buildActivitySetsPayload } from '../utils/workoutSession';
import { getDeviceTimezone, toLocalDateString } from '../utils/dateUtils';
import {
  computeLaps,
  computeSplits,
  METERS_PER_KM,
  METERS_PER_MILE,
  splitsToLapWindows,
  summarizeRecording,
  toWorkoutGpsPoints,
  type RecordedPoint,
  type DiaryActivity,
} from '../utils/gpsRecording';

/** The fewest points the server takes as a route (`points` is `.min(2)`). */
const MIN_ROUTE_POINTS = 2;

/** The library exercise a recording of `activity` is logged against, if there is one. */
async function findRecordingExercise(
  activity: DiaryActivity
): Promise<Exercise | undefined> {
  const name = EXERCISE_NAMES[activity];
  // Jump rope covers no distance - it is duration-only.
  const modality = activity === 'jumpRope' ? 'duration' : 'duration_distance';
  const matches = (await searchExercises(name)).filter(
    (exercise) => exercise.name.trim().toLowerCase() === name.toLowerCase()
  );
  // A jump rope must be duration-only. Falling back to any other "Jump Rope"
  // would snapshot its modality onto the entry, and a duration_distance one
  // gives a distance-less workout a route card and distance fields.
  return (
    matches.find((exercise) => exercise.modality === modality) ??
    (activity === 'jumpRope' ? undefined : matches[0])
  );
}

/**
 * Finds the library exercise a recording is logged against, creating a cardio
 * one when the library has none of that name.
 */
export async function resolveRecordingExercise(
  activity: DiaryActivity
): Promise<Exercise> {
  const best = await findRecordingExercise(activity);
  if (best) return best;
  return createExercise({
    name: EXERCISE_NAMES[activity],
    category: 'cardio',
    modality: activity === 'jumpRope' ? 'duration' : 'duration_distance',
    calories_per_hour: FALLBACK_CALORIES_PER_HOUR[activity],
    description: null,
  });
}

/**
 * Calories per hour the server will apply to a recording of `activity`: a
 * saved entry with no calories of its own is worth the logged exercise's
 * `calories_per_hour` times its minutes. That holds for a cardio exercise
 * with a rate; for any other the server works from body weight, age and
 * sex, which the phone does not have, so this returns null. With no
 * exercise yet, the one created at save carries the fallback rate.
 */
export async function recordingCaloriesPerHour(
  activity: DiaryActivity
): Promise<number | null> {
  const exercise = await findRecordingExercise(activity);
  if (!exercise) return FALLBACK_CALORIES_PER_HOUR[activity];
  const cardio = exercise.category?.toLowerCase() === 'cardio';
  return cardio && exercise.calories_per_hour > 0
    ? exercise.calories_per_hour
    : null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Cadence and stride from the phone's step count, best effort: a missing
 * pedometer or a failed read just leaves the fields off the entry.
 */
async function measureForm(
  session: RecordingSession,
  indoor: boolean,
  durationSeconds: number,
  distanceKm: number | null,
  indoorEstimate: IndoorDistanceEstimate | null
): Promise<FormMetrics | null> {
  try {
    if (indoor) {
      if (!indoorEstimate) return null;
      return computeFormMetrics(
        indoorEstimate.steps,
        durationSeconds,
        distanceKm != null ? distanceKm * METERS_PER_KM : null
      );
    }
    if (session.finishedAt == null) return null;
    return (
      (await measureOutdoorForm(
        {
          activity: session.activity,
          startedAt: session.startedAt,
          finishedAt: session.finishedAt,
          activeSeconds: durationSeconds,
          ...(session.stepCounterAtStart != null && {
            stepCounterAtStart: session.stepCounterAtStart,
          }),
          ...(session.hadPause === true && { paused: true }),
        },
        (distanceKm ?? 0) * METERS_PER_KM
      )) ?? null
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[GPS Recording] Could not measure form: ${message}`, 'WARNING');
    return null;
  }
}

/** What a queued upload has already done, so the next attempt skips it. */
export interface RecordingSaveProgress {
  /** The entry exists on the server (the create was answered). */
  entryId?: string;
  /** Cadence and stride put on that entry. */
  form?: FormMetrics | null;
  shoeDone?: boolean;
  trackDone?: boolean;
}

/**
 * How a recording that was saved on the phone is uploaded later (the Upload
 * queue). Without these `saveRecordedActivity` saves from the live recording
 * as before.
 */
export interface QueuedRecordingSave {
  /** The entry's id, made on the phone: the create is safe to repeat. */
  clientEntryId: string;
  /** Heart rate held with the recording; the live recording is gone by now. */
  heartRate: readonly RecordedHeartRate[];
  appleZones: AppleWorkoutZoneDuration[] | null;
  /** Where an earlier attempt got to. */
  resume: RecordingSaveProgress;
  /** Called after each step so the progress is kept before the next one. */
  onProgress: (progress: RecordingSaveProgress) => Promise<void>;
}

export interface SavedRecording {
  entryId: string;
  entryDate: string;
  /** Set when this run took the default pair to its retire-at distance. */
  wornOutShoe?: ShoeResponse;
  /** Cadence and stride put on the entry; null when none was measured. */
  form: FormMetrics | null;
}

/**
 * Saves a finished recording to the diary: the activity entry first, then its
 * route and splits. If the second step fails the entry id is kept on the
 * session, so retrying only re-sends the track (the server replaces it) and
 * never logs the activity twice.
 *
 * An outdoor session stopped before the phone had a GPS fix has fewer than the
 * two points a route needs: it is saved with its time and no distance or route
 * rather than sending a track the server rejects, which used to leave the
 * entry behind and every retry failing the same way (#3470).
 *
 * An indoor session has no route: its distance is whatever the person read off
 * the machine (`indoorDistanceKm`, null to leave it out), and there is no
 * track to send. `indoorEstimate` is the step-based distance it was prefilled
 * with: a distance the person changed teaches the app their stride.
 * `acceptedIndoorEstimate` means they left that prefilled distance as shown.
 * Learning then uses the raw estimate, not the value rounded for the field,
 * which can sit more than 1% away on a short session.
 */
export async function saveRecordedActivity(
  session: RecordingSession,
  points: readonly RecordedPoint[],
  distanceUnit: 'km' | 'miles',
  indoorDistanceKm: number | null = null,
  indoorEstimate: IndoorDistanceEstimate | null = null,
  acceptedIndoorEstimate = false,
  queued?: QueuedRecordingSave
): Promise<SavedRecording> {
  // The id the entry is created under: the same one on every attempt, so a
  // create whose answer was lost is recognised by the server.
  const clientEntryId = queued?.clientEntryId ?? session.entryClientId;
  const indoor = session.indoor === true;
  const started = new Date(session.startedAt);
  // Date, time and zone are read together, before any await: a zone change
  // during the save must not pair one zone's day with another's time.
  const entryDate = toLocalDateString(started);
  const entryTime = `${pad(started.getHours())}:${pad(started.getMinutes())}`;
  const recordTimezone = getDeviceTimezone();
  const durationSeconds = Math.max(1, Math.round(elapsedSeconds(session)));
  const trackPoints = indoor ? [] : toWorkoutGpsPoints(points);
  const hasRoute = trackPoints.length >= MIN_ROUTE_POINTS;
  const distanceKm: number | null = indoor
    ? indoorDistanceKm != null && indoorDistanceKm > 0
      ? Math.round(indoorDistanceKm * 1000) / 1000
      : null
    : hasRoute
      ? Math.round(summarizeRecording(points).distanceMeters) / METERS_PER_KM
      : null;

  // A queued upload keeps its own progress: the live recording may already be
  // gone, or be a different one, so it is never read or marked here.
  const resume = queued?.resume ?? {};
  let entryId = queued ? resume.entryId : session.savedEntryId;
  let wornOutShoe: ShoeResponse | null = null;
  // A retry reuses what the first save put on the entry.
  let form: FormMetrics | null = entryId
    ? ((queued ? resume.form : session.savedForm) ?? null)
    : null;
  const progress: RecordingSaveProgress = { ...resume };
  const remember = async (step: Partial<RecordingSaveProgress>) => {
    Object.assign(progress, step);
    await queued?.onProgress({ ...progress });
  };
  if (!entryId) {
    const exercise = await resolveRecordingExercise(session.activity);
    form = await measureForm(
      session,
      indoor,
      durationSeconds,
      distanceKm,
      indoorEstimate
    );
    const created = await createExerciseEntry({
      ...(clientEntryId ? { id: clientEntryId } : {}),
      exercise_id: exercise.id,
      exercise_name: indoor
        ? INDOOR_ENTRY_NAMES[session.activity]
        : exercise.name,
      duration_minutes: Math.round((durationSeconds / 60) * 100) / 100,
      entry_date: entryDate,
      entry_time: entryTime,
      // The time above is read on this phone, which may not be in the profile's zone.
      record_timezone: recordTimezone,
      distance: distanceKm,
      ...(form && {
        avg_cadence: form.avgCadence,
        ...(form.strideLengthCm != null && {
          stride_length_cm: form.strideLengthCm,
        }),
      }),
      sets: buildActivitySetsPayload([], new Map(), 'kg', 'duration_distance', {
        durationSec: durationSeconds,
        distanceKm,
      }),
    });
    entryId = created.id;
    if (queued) {
      await remember({ entryId, form });
    } else {
      await markRecordingSaved(session.id, entryId, form);
    }
    // Once, with the entry: a retry of a failed track upload must not teach
    // the same session twice. Best effort, never part of the save failing.
    try {
      if (indoor) {
        await learnFromIndoorEntry(
          session.activity,
          indoorEstimate,
          acceptedIndoorEstimate && indoorEstimate
            ? indoorEstimate.distanceKm
            : indoorDistanceKm
        );
      } else if (hasRoute && session.finishedAt != null) {
        // No route means no distance to learn a stride from.
        await learnFromOutdoorRecording(
          {
            activity: session.activity,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
            activeSeconds: durationSeconds,
            ...(session.stepCounterAtStart != null && {
              stepCounterAtStart: session.stepCounterAtStart,
            }),
            ...(session.hadPause === true && { paused: true }),
          },
          (distanceKm ?? 0) * METERS_PER_KM
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[GPS Recording] Could not learn stride: ${message}`, 'WARNING');
    }
    if (session.activity === 'run' && !queued) {
      wornOutShoe = await assignDefaultShoe(entryId);
    }
  }
  // A queued upload assigns the shoe as a step of its own, so a connection
  // lost right after the create still gets it on the next attempt.
  if (queued && session.activity === 'run' && !progress.shoeDone) {
    await assignDefaultShoe(entryId, true);
    await remember({ shoeDone: true });
  }

  if (hasRoute && !(queued && progress.trackDone)) {
    const unitMeters =
      distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
    await attachExerciseEntryGpsTrack(entryId, {
      points: trackPoints,
      // Laps the person marked replace the automatic splits: they are the
      // intervals they meant to compare.
      laps: splitsToLapWindows(
        session.laps && session.laps.length > 0
          ? computeLaps(points, session.laps, session.finishedAt ?? undefined)
          : computeSplits(points, unitMeters)
      ),
    });
    if (queued) await remember({ trackDone: true });
  }
  await attachWatchHeartRate(entryId, session.id, queued);
  return { entryId, entryDate, form, ...(wornOutShoe && { wornOutShoe }) };
}

/**
 * Links a freshly saved run to the person's default pair of shoes. Best
 * effort: the run is already in the diary, so a failure is logged and never
 * blocks the save. Runs only when the entry is first created, so retrying the
 * route upload does not undo a shoe the person changed in between.
 */
async function assignDefaultShoe(
  entryId: string,
  /** A queued upload: a lost connection fails the step so it is tried again. */
  retryWhenUnreachable = false
): Promise<ShoeResponse | null> {
  try {
    const shoes = await fetchShoes('active');
    const defaultShoe = shoes.find((shoe) => shoe.is_default);
    if (!defaultShoe) return null;
    await assignShoeToExerciseEntry(entryId, defaultShoe.id);
    // Only the lookup of whether the pair is now worn out is optional: the
    // run is already linked, so a failure there is not worth reporting.
    return await findShoeThatReachedLimit(
      defaultShoe.id,
      defaultShoe.is_worn_out
    ).catch(() => null);
  } catch (error) {
    if (retryWhenUnreachable && serverMayBeDown(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not assign default shoe: ${message}`,
      'WARNING'
    );
    return null;
  }
}

/**
 * Fills in heart rate from the watch (avg/max and zones) on the saved entry.
 * Best effort: the activity and its route are already stored, so a failure
 * here is logged and never blocks the save.
 */
async function attachWatchHeartRate(
  entryId: string,
  sessionId: string,
  queued?: QueuedRecordingSave
): Promise<void> {
  try {
    // A queued upload carries the readings it was saved with; the live
    // recording they came from is gone.
    const samples = queued ? queued.heartRate : await getHeartRateSamples();
    const appleZones = queued
      ? queued.appleZones
      : peekAppleWorkoutZones(sessionId);
    // The server needs two readings to measure any time in a zone, unless
    // Apple already summed the zones.
    if (samples.length < 2 && !appleZones) return;
    await attachExerciseEntryWatchTelemetry(entryId, {
      ...(samples.length >= 2
        ? {
            hrSamples: samples.map((sample) => ({
              t: new Date(sample.t).toISOString(),
              bpm: sample.bpm,
            })),
            hrSource: 'watch' as const,
          }
        : {}),
      ...(appleZones ? { appleZones } : {}),
    });
    if (appleZones && !queued) clearAppleWorkoutZones(sessionId);
  } catch (error) {
    // The run is on the server but its heart rate is not: a queued upload is
    // tried again rather than finishing without it.
    if (queued && serverMayBeDown(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not attach watch heart rate: ${message}`,
      'WARNING'
    );
  }
}
