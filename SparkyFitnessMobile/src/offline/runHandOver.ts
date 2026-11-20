import type {
  AppleWorkoutZoneDuration,
  CreateFitnessTestBody,
} from '@workspace/shared';
import type {
  RecordedHeartRate,
  RecordingSession,
} from '../services/gpsRecordingService';
import type { RecordingSaveProgress } from '../services/gpsRecordingSave';
import { addLog } from '../services/LogService';
import type { IndoorDistanceEstimate } from '../services/stepDistance';
import { getActiveServerConfigId } from '../services/storage';
import type { RecordedPoint } from '../utils/gpsRecording';
import { toLocalDateString } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import {
  deleteUnconfirmedForEntity,
  enqueueOutbox,
  listUnconfirmedOutbox,
} from './outbox';
import { signedInUserId } from './syncEngine';

/** A finished phone recording: its entry, route and heart rate. */
export const RUN_SAVE = 'run.save';
/** Ticks a training-program workout off once the run is on the server. */
export const RUN_PROGRAM_TICK = 'run.program_tick';
/** Files a fitness test against the run once it is on the server. */
export const RUN_FITNESS_TEST = 'run.fitness_test';

/** The payload shape of the three kinds above, as this build writes them. */
export const RUN_PAYLOAD_VERSION = 1;

/** Payload of a `run.save` row for a run the phone recorded itself. */
export interface QueuedRecordingPayload {
  source: 'gps';
  /** The entry's id, made on the phone; every attempt creates it under this. */
  entryId: string;
  session: RecordingSession;
  points: RecordedPoint[];
  distanceUnit: 'km' | 'miles';
  indoorDistanceKm: number | null;
  indoorEstimate: IndoorDistanceEstimate | null;
  acceptedIndoorEstimate: boolean;
  heartRate: RecordedHeartRate[];
  appleZones: AppleWorkoutZoneDuration[] | null;
  /** What earlier attempts already did, so the next one carries on. */
  progress: RecordingSaveProgress;
}

/** Payload of a `run.program_tick` row. */
export interface QueuedProgramTickPayload {
  programId: string;
  index: number;
  /** The local day the run started on. */
  day: string;
  entryId: string;
}

/** Payload of a `run.fitness_test` row: the request, entry id filled in. */
export interface QueuedFitnessTestPayload {
  body: CreateFitnessTestBody;
}

export interface QueueRecordedRunInput {
  session: RecordingSession;
  points: readonly RecordedPoint[];
  distanceUnit: 'km' | 'miles';
  indoorDistanceKm: number | null;
  indoorEstimate: IndoorDistanceEstimate | null;
  acceptedIndoorEstimate: boolean;
  heartRate: readonly RecordedHeartRate[];
  appleZones: AppleWorkoutZoneDuration[] | null;
  /** A completed fitness test to file once the run is uploaded. */
  fitnessTest: Omit<CreateFitnessTestBody, 'exercise_entry_id'> | null;
  /** The program workout to tick off once the run is uploaded. */
  programTick: { programId: string; index: number } | null;
}

/**
 * Keeps a finished phone recording, with the follow-ups that need its entry
 * (program tick, fitness test), in the upload queue so the recording can be
 * cleared while the server cannot be reached. The follow-ups wait for the run.
 *
 * Resolves the entry id the run will have, or null when nothing was written;
 * the caller must keep the recording in that case.
 */
export async function queueRecordedRun(
  input: QueueRecordedRunInput
): Promise<{ entryId: string; entryDate: string } | null> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return null;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    // An earlier attempt that already created the entry hands its id on; a
    // recording from an older build has none of its own, so one is made now.
    const entryId =
      input.session.savedEntryId ?? input.session.entryClientId ?? newUuid();
    const entryDate = toLocalDateString(new Date(input.session.startedAt));
    const payload: QueuedRecordingPayload = {
      source: 'gps',
      entryId,
      session: input.session,
      points: [...input.points],
      distanceUnit: input.distanceUnit,
      indoorDistanceKm: input.indoorDistanceKm,
      indoorEstimate: input.indoorEstimate,
      acceptedIndoorEstimate: input.acceptedIndoorEstimate,
      heartRate: [...input.heartRate],
      appleZones: input.appleZones,
      progress: input.session.savedEntryId
        ? { entryId, form: input.session.savedForm ?? null }
        : {},
    };
    await db.transaction(async (tx) => {
      const saveRowId = await enqueueOutbox(tx, {
        id: newUuid(),
        serverConfigId,
        userId,
        kind: RUN_SAVE,
        entityId: entryId,
        entryDate,
        payload,
        payloadVersion: RUN_PAYLOAD_VERSION,
      });
      if (input.programTick) {
        await enqueueOutbox(tx, {
          id: newUuid(),
          serverConfigId,
          userId,
          kind: RUN_PROGRAM_TICK,
          entityId: `run-program:${entryId}`,
          dependsOn: saveRowId,
          entryDate,
          payload: {
            ...input.programTick,
            day: entryDate,
            entryId,
          } satisfies QueuedProgramTickPayload,
          payloadVersion: RUN_PAYLOAD_VERSION,
        });
      }
      if (input.fitnessTest) {
        await enqueueOutbox(tx, {
          id: newUuid(),
          serverConfigId,
          userId,
          kind: RUN_FITNESS_TEST,
          entityId: `run-test:${entryId}`,
          dependsOn: saveRowId,
          entryDate,
          payload: {
            body: { ...input.fitnessTest, exercise_entry_id: entryId },
          } satisfies QueuedFitnessTestPayload,
          payloadVersion: RUN_PAYLOAD_VERSION,
        });
      }
    });
    notifyOutboxChanged();
    return { entryId, entryDate };
  } catch (error) {
    addLog(`[Offline] Could not queue the run: ${error}`, 'ERROR');
    return null;
  }
}

/**
 * Removes a run that is still waiting to upload, with the follow-ups waiting
 * for it. False when nothing was removed: the run is not queued, or an
 * attempt already put it on the server, where it must be deleted from the
 * Diary once it is there.
 */
export async function discardQueuedRun(entryId: string): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const row = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (candidate) =>
        candidate.kind === RUN_SAVE && candidate.entityId === entryId
    );
    if (!row) return false;
    if ((row.payload as QueuedRecordingPayload).progress?.entryId) return false;
    await deleteUnconfirmedForEntity(db, serverConfigId, entryId);
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not discard the run: ${error}`, 'ERROR');
    return false;
  }
}
