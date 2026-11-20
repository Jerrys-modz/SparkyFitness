import { invalidateExerciseCache } from '../../hooks/invalidateExerciseCache';
import { queryClient } from '../../hooks/queryClient';
import { saveFitnessTest } from '../../services/fitnessTestService';
import { saveRecordedActivity } from '../../services/gpsRecordingSave';
import { addLog } from '../../services/LogService';
import { completeProgramWorkout } from '../../services/runProgramService';
import { serverMayBeDown } from '../../utils/serverErrors';
import { ApiError } from '../../services/api/errors';
import { getOfflineDb } from '../db';
import { updateOutboxRow } from '../outbox';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import {
  RUN_FITNESS_TEST,
  RUN_PAYLOAD_VERSION,
  RUN_PROGRAM_TICK,
  RUN_SAVE,
  type QueuedFitnessTestPayload,
  type QueuedProgramTickPayload,
  type QueuedRecordingPayload,
} from '../runHandOver';
import { registerOutboxHandler } from './registry';

const refreshDiary = (row: OutboxRow) => {
  if (row.entryDate) invalidateExerciseCache(queryClient, row.entryDate);
};

/**
 * Sends a recorded run: the entry (created under the id the phone made, so a
 * repeat finds it), the shoe, the route and the heart rate. What each attempt
 * got done is written back to the row as it goes, so a connection lost half
 * way carries on from there instead of starting again.
 */
async function sendRecordedRun(row: OutboxRow): Promise<SendResult> {
  const payload = row.payload as QueuedRecordingPayload;
  try {
    await saveRecordedActivity(
      payload.session,
      payload.points,
      payload.distanceUnit,
      payload.indoorDistanceKm,
      payload.indoorEstimate,
      payload.acceptedIndoorEstimate,
      {
        clientEntryId: payload.entryId,
        heartRate: payload.heartRate,
        appleZones: payload.appleZones,
        resume: payload.progress,
        onProgress: async (progress) => {
          // Only while this attempt still owns the row.
          await updateOutboxRow(
            await getOfflineDb(),
            row.id,
            { payload: { ...payload, progress } },
            undefined,
            { onlyIfStatus: 'sending' }
          );
        },
      }
    );
    return { outcome: 'synced' };
  } catch (error) {
    return sendResultFromError(error);
  }
}

/**
 * A follow-up the server refuses for good (the program moved on, the test
 * was already filed) is not worth keeping: the run itself is uploaded. Only
 * a lost connection or a refused sign-in keeps it waiting.
 */
function followUpResult(error: unknown, what: string): SendResult {
  if (
    serverMayBeDown(error) ||
    (error instanceof ApiError && error.statusCode === 401)
  ) {
    return sendResultFromError(error);
  }
  addLog(`[Offline] ${what} was refused and is dropped: ${error}`, 'WARNING');
  return { outcome: 'synced' };
}

async function sendProgramTick(row: OutboxRow): Promise<SendResult> {
  const { programId, index, day, entryId } =
    row.payload as QueuedProgramTickPayload;
  try {
    await completeProgramWorkout(programId, index, day, entryId);
    return { outcome: 'synced' };
  } catch (error) {
    return followUpResult(error, 'The program workout tick');
  }
}

async function sendFitnessTest(row: OutboxRow): Promise<SendResult> {
  const { body } = row.payload as QueuedFitnessTestPayload;
  try {
    await saveFitnessTest(body);
    return { outcome: 'synced' };
  } catch (error) {
    return followUpResult(error, 'The fitness test');
  }
}

const base = {
  payloadVersion: RUN_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload: unknown) => payload,
  onSynced: refreshDiary,
};

const handlers: OutboxHandler[] = [
  { ...base, kind: RUN_SAVE, send: sendRecordedRun },
  { ...base, kind: RUN_PROGRAM_TICK, send: sendProgramTick },
  { ...base, kind: RUN_FITNESS_TEST, send: sendFitnessTest },
];

/** Makes queued runs sendable. Called once at app start. */
export function registerRunHandlers(): void {
  handlers.forEach(registerOutboxHandler);
}
