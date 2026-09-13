/**
 * Liftosaur Workout Export Service.
 * Identifies eligible non-Liftosaur workouts in SparkyFitness within the sync window,
 * translates them into the Liftohistory format, and posts them to Liftosaur v1 REST API.
 */
import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import { localDateTimeToUtc, instantToDay } from '@workspace/shared';
import { serializeLiftohistory } from './liftohistorySerializer.js';
import {
  LiftohistoryExportWorkout,
  LiftohistoryExportExercise,
  LiftohistoryExportSet,
} from './liftosaurTypes.js';

const LIFTOSAUR_API_BASE_URL =
  process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL || 'https://www.liftosaur.com';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ExerciseEntryRow {
  id: string;
  user_id: string;
  exercise_name: string;
  entry_date: string | Date;
  entry_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  source: string | null;
  exercise_preset_entry_id: string | null;
  preset_name: string | null;
}

interface ExerciseSetRow {
  set_number: number;
  set_type: string | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  duration: number | null;
  notes: string | null;
}

/**
 * Post a serialized workout text to Liftosaur API.
 */
async function postWorkoutToLiftosaur(
  apiKey: string,
  workoutText: string
): Promise<boolean> {
  try {
    await axios.post(
      `${LIFTOSAUR_API_BASE_URL}/api/v1/history`,
      { text: workoutText },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (err) {
    log('error', `[liftosaurWorkoutExport] Failed to post workout to Liftosaur: ${errorMessage(err)}`);
    return false;
  }
}

/**
 * Export non-Liftosaur workouts from SparkyFitness to Liftosaur.
 */
export async function exportWorkoutsToLiftosaur(
  userId: string,
  apiKey: string,
  tz: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<number> {
  const client = await getSystemClient();
  let exportedCount = 0;

  try {
    // 1. Fetch eligible exercise entries excluding Liftosaur-originated rows
    const query = `
      SELECT ee.id, ee.user_id, ee.exercise_name, ee.entry_date, ee.entry_time,
             ee.duration_minutes, ee.notes, ee.source, ee.exercise_preset_entry_id,
             epe.name as preset_name
      FROM exercise_entries ee
      LEFT JOIN exercise_preset_entries epe ON epe.id = ee.exercise_preset_entry_id
      WHERE ee.user_id = $1
        AND (ee.source IS NULL OR LOWER(ee.source) != 'liftosaur')
        AND ($2::date IS NULL OR ee.entry_date >= $2)
        AND ($3::date IS NULL OR ee.entry_date <= $3)
      ORDER BY ee.entry_date ASC, ee.entry_time ASC NULLS LAST, ee.sort_order ASC, ee.created_at ASC
    `;
    const res = (await client.query(query, [
      userId,
      startDate || null,
      endDate || null,
    ])) as { rows: ExerciseEntryRow[] };

    if (res.rows.length === 0) {
      return 0;
    }

    // 2. Group entries into distinct workout sessions
    const sessionMap = new Map<string, ExerciseEntryRow[]>();
    for (const row of res.rows) {
      const dayStr =
        row.entry_date instanceof Date
          ? instantToDay(row.entry_date, tz)
          : String(row.entry_date).slice(0, 10);
      const timeStr = row.entry_time ? row.entry_time.slice(0, 5) : '00:00';
      const sessionKey = row.exercise_preset_entry_id
        ? `preset_${row.exercise_preset_entry_id}`
        : `adhoc_${dayStr}_${timeStr}`;

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, []);
      }
      sessionMap.get(sessionKey)!.push(row);
    }

    // 3. For each session, fetch sets and construct export workout
    for (const [, entries] of sessionMap.entries()) {
      if (entries.length === 0) continue;

      const firstEntry = entries[0]!;
      const dayStr =
        firstEntry.entry_date instanceof Date
          ? instantToDay(firstEntry.entry_date, tz)
          : String(firstEntry.entry_date).slice(0, 10);
      const timeStr = firstEntry.entry_time
        ? firstEntry.entry_time.length === 5
          ? `${firstEntry.entry_time}:00`
          : firstEntry.entry_time
        : '12:00:00';

      const sessionUtcInstant = localDateTimeToUtc(`${dayStr}T${timeStr}`, tz);

      let totalDurationMinutes = 0;
      const exportExercises: LiftohistoryExportExercise[] = [];

      for (const entry of entries) {
        if (entry.duration_minutes) {
          totalDurationMinutes += entry.duration_minutes;
        }

        const setsRes = (await client.query(
          `SELECT set_number, set_type, reps, weight, rpe, duration, notes
           FROM exercise_entry_sets
           WHERE exercise_entry_id = $1
           ORDER BY set_number ASC`,
          [entry.id]
        )) as { rows: ExerciseSetRow[] };

        const exportSets: LiftohistoryExportSet[] = [];
        for (const set of setsRes.rows) {
          if (set.reps && set.reps > 0) {
            exportSets.push({
              reps: Number(set.reps),
              weight: set.weight !== null ? Number(set.weight) : null,
              weightUnit: 'kg',
              rpe: set.rpe !== null ? Number(set.rpe) : null,
              durationSeconds: set.duration !== null ? Number(set.duration) : null,
              setType: set.set_type ? set.set_type.toLowerCase() : null,
              notes: set.notes,
            });
          }
        }

        // Only include exercises that have working/warmup sets defined
        if (exportSets.length > 0) {
          exportExercises.push({
            name: entry.exercise_name || 'Exercise',
            notes: entry.notes || null,
            sets: exportSets,
          });
        }
      }

      if (exportExercises.length > 0) {
        const programName = firstEntry.preset_name || 'SparkyFitness Workout';
        const exportWorkout: LiftohistoryExportWorkout = {
          date: sessionUtcInstant.toISOString(),
          programName,
          dayName: firstEntry.preset_name ? firstEntry.preset_name : 'Workout',
          durationSeconds: totalDurationMinutes > 0 ? totalDurationMinutes * 60 : undefined,
          notes: firstEntry.notes || undefined,
          exercises: exportExercises,
        };

        const serializedText = serializeLiftohistory(exportWorkout);
        const posted = await postWorkoutToLiftosaur(apiKey, serializedText);
        if (posted) {
          exportedCount += 1;
        }
      }
    }
  } catch (err) {
    log('error', `[liftosaurWorkoutExport] Error exporting workouts: ${errorMessage(err)}`);
  } finally {
    client.release();
  }

  return exportedCount;
}

export default {
  exportWorkoutsToLiftosaur,
};
