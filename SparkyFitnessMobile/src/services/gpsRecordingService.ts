import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addLog } from './LogService';
import {
  acceptFix,
  type RawFix,
  type RecordedPoint,
  type RecordingActivity,
} from '../utils/gpsRecording';

/**
 * Records a walk, run or ride from the phone's GPS.
 *
 * A location task (`expo-location` on `expo-task-manager`) receives the fixes,
 * so recording carries on with the screen locked: a foreground service on
 * Android, the `location` background mode on iOS. Both start while the app is
 * on screen, so only the while-using-the-app permission is needed.
 *
 * Every accepted fix is written to AsyncStorage in small chunks as it
 * arrives. A dropped connection never touches the track (nothing is sent until
 * the person finishes), and an app killed mid-recording leaves the session and
 * its points on disk for `hydrate()` to pick up.
 */

export const GPS_RECORDING_TASK_NAME = 'sparky-gps-recording';

const SESSION_KEY = '@SparkyFitness/gpsRecording/session';
const HEART_RATE_KEY = '@SparkyFitness/gpsRecording/heartRate';
const chunkKey = (index: number) =>
  `@SparkyFitness/gpsRecording/chunk/${index}`;
/** Points per stored chunk: bounds how much is rewritten on each fix. */
const CHUNK_SIZE = 100;

export type RecordingStatus = 'recording' | 'paused' | 'finished';

export interface RecordingSession {
  id: string;
  activity: RecordingActivity;
  status: RecordingStatus;
  /** Epoch ms of the first Start press. */
  startedAt: number;
  /** Epoch ms the recording ended (finished status only). */
  finishedAt: number | null;
  /** Epoch ms the current pause began (paused status only). */
  pausedAt: number | null;
  /** Total time spent paused before the current pause, in ms. */
  pausedMs: number;
  /** Current stretch; goes up on every resume. */
  seg: number;
  /** Set once the diary entry exists, so a retried save never duplicates it. */
  savedEntryId: string | null;
}

/** One heart-rate reading from a paired watch during the recording. */
export interface RecordedHeartRate {
  /** Epoch ms. */
  t: number;
  bpm: number;
}

interface StoredHeartRate {
  samples: RecordedHeartRate[];
  /** Batches already taken, so a re-delivered queued batch is not added twice. */
  batchIds: string[];
}

/** Batch ids remembered; far more than a recording ever produces. */
const MAX_BATCH_IDS = 500;

export interface RecordingSnapshot {
  session: RecordingSession | null;
  points: readonly RecordedPoint[];
}

export class RecordingPermissionError extends Error {
  constructor(
    readonly reason: 'denied' | 'services-disabled',
    message: string
  ) {
    super(message);
    this.name = 'RecordingPermissionError';
  }
}

let session: RecordingSession | null = null;
let points: RecordedPoint[] = [];
let snapshot: RecordingSnapshot = { session: null, points: [] };
let heartRate: StoredHeartRate = { samples: [], batchIds: [] };
let hydrated: Promise<void> | null = null;
const listeners = new Set<() => void>();
// The task callback and the screen's own writes share one session, so every
// read-modify-write runs on this chain instead of overlapping.
let queue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

function publish(): void {
  snapshot = { session, points: points.slice() };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): RecordingSnapshot => snapshot;

/** Live recording state for the screen. */
export function useGpsRecording(): RecordingSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const getHasRecording = (): boolean => snapshot.session != null;

/**
 * Whether a recording exists (running, paused or finished but unsaved). A
 * boolean, so a screen that only reserves room for the recording bar does not
 * re-render on every location fix the way `useGpsRecording` would.
 */
export function useHasGpsRecording(): boolean {
  return useSyncExternalStore(subscribe, getHasRecording, getHasRecording);
}

async function persistSession(): Promise<void> {
  if (session) {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}

async function persistChunk(index: number): Promise<void> {
  const chunk = points.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
  await AsyncStorage.setItem(chunkKey(index), JSON.stringify(chunk));
}

async function clearStoredPoints(): Promise<void> {
  const chunkCount = Math.ceil(points.length / CHUNK_SIZE) + 1;
  const keys = Array.from({ length: chunkCount }, (_, i) => chunkKey(i));
  await AsyncStorage.multiRemove(keys);
}

/**
 * Loads whatever an earlier run left on disk. Safe to call repeatedly; the
 * task callback calls it too, because a killed app can be woken by a location
 * fix before any screen has mounted.
 */
export function hydrate(): Promise<void> {
  if (!hydrated) {
    hydrated = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as RecordingSession;
        const loaded: RecordedPoint[] = [];
        for (let index = 0; ; index++) {
          const chunk = await AsyncStorage.getItem(chunkKey(index));
          if (!chunk) break;
          loaded.push(...(JSON.parse(chunk) as RecordedPoint[]));
        }
        const storedHeartRate = await AsyncStorage.getItem(HEART_RATE_KEY);
        session = stored;
        points = loaded;
        heartRate = storedHeartRate
          ? (JSON.parse(storedHeartRate) as StoredHeartRate)
          : { samples: [], batchIds: [] };
        publish();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(
          `[GPS Recording] Could not restore session: ${message}`,
          'ERROR'
        );
      }
    })();
  }
  return hydrated;
}

/** Feeds a batch of fixes through the noise filter into the stored track. */
export function ingestFixes(fixes: readonly RawFix[]): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (!session || session.status !== 'recording') return;
    const firstTouched = Math.floor(points.length / CHUNK_SIZE);
    let added = 0;
    for (const fix of fixes) {
      const accepted = acceptFix(
        points[points.length - 1],
        fix,
        session.seg,
        session.activity
      );
      if (accepted) {
        points.push(accepted);
        added++;
      }
    }
    if (added === 0) return;
    const lastTouched = Math.floor((points.length - 1) / CHUNK_SIZE);
    for (let index = firstTouched; index <= lastTouched; index++) {
      await persistChunk(index);
    }
    publish();
  });
}

function toRawFix(location: Location.LocationObject): RawFix {
  const { coords } = location;
  return {
    t: location.timestamp,
    lat: coords.latitude,
    lon: coords.longitude,
    alt: coords.altitude,
    hacc: coords.accuracy,
    vacc: coords.altitudeAccuracy,
    speed: coords.speed,
    course: coords.heading,
  };
}

interface LocationTaskBody {
  locations?: Location.LocationObject[];
}

// Defined at module scope: the OS can start the app just to deliver a fix, and
// the task has to exist before React does.
TaskManager.defineTask(GPS_RECORDING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    addLog(`[GPS Recording] Location task error: ${error.message}`, 'ERROR');
    return;
  }
  const locations = (data as LocationTaskBody | undefined)?.locations;
  if (!locations || locations.length === 0) return;
  await ingestFixes(locations.map(toRawFix));
});

export interface StartRecordingOptions {
  activity: RecordingActivity;
  /** Text for the Android foreground-service notification. */
  notification: { title: string; body: string };
}

async function startUpdates(
  notification: StartRecordingOptions['notification']
): Promise<void> {
  await Location.startLocationUpdatesAsync(GPS_RECORDING_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 2,
    timeInterval: 2000,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: notification.title,
      notificationBody: notification.body,
      killServiceOnDestroy: false,
    },
  });
}

async function stopUpdates(): Promise<void> {
  try {
    if (
      await Location.hasStartedLocationUpdatesAsync(GPS_RECORDING_TASK_NAME)
    ) {
      await Location.stopLocationUpdatesAsync(GPS_RECORDING_TASK_NAME);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not stop location updates: ${message}`,
      'WARNING'
    );
  }
}

/** Asks for location access and starts a new recording. */
export function startRecording(options: StartRecordingOptions): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (session) throw new Error('A recording is already in progress.');
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new RecordingPermissionError(
        'services-disabled',
        'Location services are turned off.'
      );
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new RecordingPermissionError(
        'denied',
        'Location permission was not granted.'
      );
    }
    const now = Date.now();
    session = {
      id: `rec-${now}`,
      activity: options.activity,
      status: 'recording',
      startedAt: now,
      finishedAt: null,
      pausedAt: null,
      pausedMs: 0,
      seg: 0,
      savedEntryId: null,
    };
    points = [];
    try {
      await startUpdates(options.notification);
    } catch (error) {
      session = null;
      throw error;
    }
    await persistSession();
    publish();
    addLog(`[GPS Recording] Started ${options.activity} recording`, 'INFO');
  });
}

/** Whether the location task is currently registered with the OS. */
async function updatesRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(
      GPS_RECORDING_TASK_NAME
    );
  } catch {
    return false;
  }
}

/**
 * Pausing only flips the session status; the location task keeps running and
 * `ingestFixes` drops its fixes until the person resumes. Stopping the task
 * here would make resume start it again, and that cannot be done from the
 * background: iOS ignores a while-using location start made out of sight, and
 * Android 12+ refuses to start a foreground service. A resume sent from the
 * watch with the phone locked would then either throw or leave a recording
 * that never receives a fix.
 */
export function pauseRecording(): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (!session || session.status !== 'recording') return;
    session = { ...session, status: 'paused', pausedAt: Date.now() };
    await persistSession();
    publish();
  });
}

export function resumeRecording(
  notification: StartRecordingOptions['notification']
): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (!session || session.status !== 'paused') return;
    const paused = session;
    const now = Date.now();
    session = {
      ...paused,
      status: 'recording',
      pausedMs: paused.pausedMs + (now - (paused.pausedAt ?? now)),
      pausedAt: null,
      seg: paused.seg + 1,
    };
    await persistSession();
    try {
      // The task normally survived the pause. It only needs starting again
      // when the OS or a relaunch dropped it in the meantime.
      if (!(await updatesRunning())) await startUpdates(notification);
    } catch (error) {
      // Stay paused so the person can try again, and make sure no
      // half-started task is left running.
      session = paused;
      await persistSession();
      await stopUpdates();
      throw error;
    }
    publish();
  });
}

/** Stops collecting. The track stays on disk until it is saved or discarded. */
export function finishRecording(): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (!session || session.status === 'finished') return;
    const now = Date.now();
    // A paused finish ends the clock at `pausedAt`, so the final pause is
    // already excluded: adding it to `pausedMs` would remove it twice.
    const pausedMs = session.pausedMs;
    session = {
      ...session,
      status: 'finished',
      finishedAt: session.status === 'paused' ? (session.pausedAt ?? now) : now,
      pausedAt: null,
      pausedMs,
    };
    await persistSession();
    await stopUpdates();
    publish();
  });
}

/**
 * Adds a batch of watch heart-rate readings to the recording. Ignored when the
 * batch belongs to a different recording or was already taken. Still accepted
 * after Finish: the watch's last batch is often queued and lands late.
 */
export function addHeartRateSamples(
  sessionId: string,
  batchId: string,
  readings: readonly RecordedHeartRate[]
): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    if (!session || session.id !== sessionId) return;
    if (batchId && heartRate.batchIds.includes(batchId)) return;
    const valid = readings.filter(
      (reading) =>
        Number.isFinite(reading.t) && reading.bpm > 0 && reading.bpm < 300
    );
    if (valid.length === 0) return;
    heartRate = {
      samples: [...heartRate.samples, ...valid].sort((a, b) => a.t - b.t),
      batchIds: batchId
        ? [...heartRate.batchIds, batchId].slice(-MAX_BATCH_IDS)
        : heartRate.batchIds,
    };
    await AsyncStorage.setItem(HEART_RATE_KEY, JSON.stringify(heartRate));
  });
}

/** Heart-rate readings collected so far, oldest first. */
export async function getHeartRateSamples(): Promise<RecordedHeartRate[]> {
  await queue.catch(() => undefined);
  await hydrate();
  return heartRate.samples.slice();
}

/** Records that the diary entry exists, so a retried save only re-sends the track. */
export function markRecordingSaved(entryId: string): Promise<void> {
  return enqueue(async () => {
    if (!session) return;
    session = { ...session, savedEntryId: entryId };
    await persistSession();
    publish();
  });
}

/** Drops the session and every stored point. */
export function discardRecording(): Promise<void> {
  return enqueue(async () => {
    await hydrate();
    await stopUpdates();
    await clearStoredPoints();
    await AsyncStorage.removeItem(HEART_RATE_KEY);
    session = null;
    points = [];
    heartRate = { samples: [], batchIds: [] };
    await persistSession();
    publish();
  });
}

/** Seconds on the clock for a session, with pauses removed. */
export function elapsedSeconds(
  current: RecordingSession,
  now: number = Date.now()
): number {
  const end =
    current.status === 'finished'
      ? (current.finishedAt ?? now)
      : current.status === 'paused'
        ? (current.pausedAt ?? now)
        : now;
  return Math.max(0, (end - current.startedAt - current.pausedMs) / 1000);
}

/** Test seam: forgets in-memory state so the next call re-reads storage. */
export function resetRecordingStateForTests(): void {
  session = null;
  points = [];
  heartRate = { samples: [], batchIds: [] };
  hydrated = null;
  queue = Promise.resolve();
  publish();
}
