import { log } from '../config/logging.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { describeError } from '../utils/errors.js';
import {
  bloodPressureArmSchema,
  bloodPressureBodyPositionSchema,
} from '@workspace/shared';

/**
 * One blood pressure reading from a connected source (Health Connect, Apple
 * Health, Withings). A source may deliver systolic and diastolic separately;
 * the pair is joined by the instant, since `vitals_entries` upserts on
 * (user, source, timestamp) and keeps the value a later write leaves out.
 */
export interface SyncedBloodPressureReading {
  /** Calendar day of the reading in the person's zone. */
  entryDate: string;
  /** The instant of the reading, ISO. */
  timestamp: string;
  /** Normalized source name (`health_connect`, `healthkit`, `withings`). */
  sourceProvider: string;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  /** `left` or `right`; anything else is ignored. */
  arm?: string | null;
  /** `sitting`, `standing`, `lying` or `reclining`; anything else is ignored. */
  bodyPosition?: string | null;
  note?: string | null;
}

/**
 * Withings reports one cuff reading through both its measure and heart APIs,
 * a few seconds apart. Readings of that source this close are one reading.
 */
const SAME_READING_WINDOW_SECONDS = 30;
const SNAPPED_SOURCES = new Set(['withings']);

const NOTE_MAX_LENGTH = 500;

const cleanNote = (note: string | null | undefined): string | null => {
  if (typeof note !== 'string') return null;
  const trimmed = note.trim().slice(0, NOTE_MAX_LENGTH);
  return trimmed === '' ? null : trimmed;
};

const SYSTOLIC = { min: 30, max: 300 };
const DIASTOLIC = { min: 10, max: 200 };
const PULSE = { min: 20, max: 300 };

const inRange = (
  value: number | null | undefined,
  bounds: { min: number; max: number }
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= bounds.min &&
  value <= bounds.max;

/**
 * Merges readings that share a source and instant, so a batch that carries the
 * two halves of one reading writes one row.
 */
function mergeReadings(
  readings: SyncedBloodPressureReading[]
): SyncedBloodPressureReading[] {
  const merged = new Map<string, SyncedBloodPressureReading>();
  for (const reading of readings) {
    const key = `${reading.sourceProvider}|${reading.timestamp}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...reading });
      continue;
    }
    current.systolic = reading.systolic ?? current.systolic;
    current.diastolic = reading.diastolic ?? current.diastolic;
    current.pulse = reading.pulse ?? current.pulse;
    current.arm = reading.arm ?? current.arm;
    current.bodyPosition = reading.bodyPosition ?? current.bodyPosition;
    current.note = reading.note ?? current.note;
  }
  return [...merged.values()];
}

/**
 * Stores synced readings in `vitals_entries`, the single home of blood
 * pressure. Values outside what a cuff can read are dropped, and a reading
 * whose two values are both known must have systolic above diastolic. Returns
 * how many rows were written. It never throws: the caller's own write (a
 * custom measurement, kept as before) must not fail because of this one.
 */
export async function recordSyncedBloodPressure(
  userId: string,
  actingUserId: string,
  readings: SyncedBloodPressureReading[]
): Promise<number> {
  const entries = [];
  for (const reading of mergeReadings(readings)) {
    let timestamp = new Date(reading.timestamp);
    const systolic = inRange(reading.systolic, SYSTOLIC)
      ? reading.systolic
      : null;
    const diastolic = inRange(reading.diastolic, DIASTOLIC)
      ? reading.diastolic
      : null;
    if (systolic === null && diastolic === null) continue;
    if (systolic !== null && diastolic !== null && systolic <= diastolic) {
      log(
        'warn',
        `bloodPressureSync: skipped ${systolic}/${diastolic} at ${reading.timestamp}, systolic is not above diastolic.`
      );
      continue;
    }
    if (SNAPPED_SOURCES.has(reading.sourceProvider)) {
      try {
        const nearby =
          await genericHealthRepository.findNearbyBloodPressureTimestamp(
            userId,
            actingUserId,
            reading.sourceProvider,
            timestamp,
            SAME_READING_WINDOW_SECONDS
          );
        if (nearby) timestamp = nearby;
      } catch (error) {
        log(
          'warn',
          `bloodPressureSync: could not look for a nearby reading: ${describeError(error)}`
        );
      }
    }
    entries.push({
      user_id: userId,
      entry_date: reading.entryDate,
      timestamp,
      systolic_mmhg: systolic,
      diastolic_mmhg: diastolic,
      pulse_bpm: inRange(reading.pulse, PULSE) ? reading.pulse : null,
      arm: bloodPressureArmSchema.safeParse(reading.arm).data ?? null,
      body_position:
        bloodPressureBodyPositionSchema.safeParse(reading.bodyPosition).data ??
        null,
      note: cleanNote(reading.note),
      source_provider: reading.sourceProvider,
    });
  }
  if (entries.length === 0) return 0;
  try {
    const written = await genericHealthRepository.bulkUpsertVitals(
      userId,
      actingUserId,
      entries
    );
    return written.length;
  } catch (error) {
    log(
      'error',
      `bloodPressureSync: could not store ${entries.length} reading(s) for user ${userId}: ${describeError(error)}`
    );
    return 0;
  }
}
