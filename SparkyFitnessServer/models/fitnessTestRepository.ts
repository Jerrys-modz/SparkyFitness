import { getClient } from '../db/poolManager.js';
import {
  evaluateFitnessTest,
  fitnessTestPacesSchema,
  type CreateFitnessTestBody,
  type FitnessTestResponse,
} from '@workspace/shared';

/** Dates as YYYY-MM-DD text: the driver would turn a DATE into a JS Date in the server's time zone. */
const COLUMNS = "*, to_char(test_date, 'YYYY-MM-DD') AS test_day";

/** Most tests returned in one list. */
export const MAX_FITNESS_TESTS_LISTED = 50;

/** Thrown when the measurements do not make a believable test. */
export class InvalidFitnessTestError extends Error {}

/** Thrown when the recorded activity named for the test is not the person's. */
export class UnknownExerciseEntryError extends Error {}

function mapRow(row: Record<string, unknown>): FitnessTestResponse | null {
  const paces = fitnessTestPacesSchema.safeParse(row.paces);
  if (!paces.success) return null;
  return {
    id: String(row.id),
    test_type: row.test_type as FitnessTestResponse['test_type'],
    test_date: String(row.test_day),
    distance_meters: Number(row.distance_meters),
    duration_seconds: Number(row.duration_seconds),
    split_distance_meters:
      row.split_distance_meters === null
        ? null
        : Number(row.split_distance_meters),
    result_value: Number(row.result_value),
    exercise_entry_id: row.exercise_entry_id
      ? String(row.exercise_entry_id)
      : null,
    paces: paces.data,
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

function mapRows(rows: Record<string, unknown>[]): FitnessTestResponse[] {
  return rows.flatMap((row) => {
    const mapped = mapRow(row);
    return mapped ? [mapped] : [];
  });
}

/** The person's tests, newest first. */
export async function listFitnessTests(
  userId: string,
  authenticatedUserId?: string,
  limit: number = MAX_FITNESS_TESTS_LISTED
): Promise<FitnessTestResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM fitness_tests
        WHERE user_id = $1
        ORDER BY test_date DESC, created_at DESC
        LIMIT $2`,
      [userId, Math.min(Math.max(1, limit), MAX_FITNESS_TESTS_LISTED)]
    );
    return mapRows(result.rows);
  } finally {
    client.release();
  }
}

/** The newest test, or null when the person has not run one. */
export async function getLatestFitnessTest(
  userId: string,
  authenticatedUserId?: string
): Promise<FitnessTestResponse | null> {
  const [latest] = await listFitnessTests(userId, authenticatedUserId, 1);
  return latest ?? null;
}

/**
 * Works the result and paces out from the measurements and saves the test. A
 * test for a recorded activity that was already saved is updated in place, so
 * a retried request never files it twice.
 */
export async function createFitnessTest(
  userId: string,
  body: CreateFitnessTestBody,
  authenticatedUserId?: string
): Promise<FitnessTestResponse> {
  const outcome = evaluateFitnessTest({
    type: body.test_type,
    distanceMeters: body.distance_meters,
    durationSeconds: body.duration_seconds,
    splitDistanceMeters: body.split_distance_meters,
  });
  if (!outcome) {
    throw new InvalidFitnessTestError(
      'These measurements do not make a believable fitness test.'
    );
  }
  const entryId = body.exercise_entry_id ?? null;
  const client = await getClient(userId, authenticatedUserId);
  try {
    if (entryId) {
      const owned = await client.query(
        'SELECT 1 FROM exercise_entries WHERE id = $1 AND user_id = $2',
        [entryId, userId]
      );
      if (owned.rowCount === 0) throw new UnknownExerciseEntryError();
    }
    const values = [
      userId,
      body.test_type,
      body.test_date,
      entryId,
      body.distance_meters,
      body.duration_seconds,
      body.split_distance_meters ?? null,
      outcome.resultValue,
      outcome.paces.thresholdSecondsPerKm,
      outcome.paces.equivalent5kSeconds,
      JSON.stringify(outcome.paces),
    ];
    const columns = `user_id, test_type, test_date, exercise_entry_id,
          distance_meters, duration_seconds, split_distance_meters,
          result_value, threshold_pace_seconds_per_km, equivalent_5k_seconds, paces`;
    const insert = `INSERT INTO fitness_tests (${columns})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`;
    const sql = entryId
      ? `${insert}
         ON CONFLICT (exercise_entry_id) WHERE exercise_entry_id IS NOT NULL
         DO UPDATE SET test_type = EXCLUDED.test_type,
           test_date = EXCLUDED.test_date,
           distance_meters = EXCLUDED.distance_meters,
           duration_seconds = EXCLUDED.duration_seconds,
           split_distance_meters = EXCLUDED.split_distance_meters,
           result_value = EXCLUDED.result_value,
           threshold_pace_seconds_per_km = EXCLUDED.threshold_pace_seconds_per_km,
           equivalent_5k_seconds = EXCLUDED.equivalent_5k_seconds,
           paces = EXCLUDED.paces,
           updated_at = NOW()
         RETURNING ${COLUMNS}`
      : `${insert} RETURNING ${COLUMNS}`;
    const result = await client.query(sql, values);
    const mapped = mapRow(result.rows[0]);
    if (!mapped) throw new Error('Saved fitness test could not be read back');
    return mapped;
  } finally {
    client.release();
  }
}

/** Deletes one of the person's tests; false when there was none. */
export async function deleteFitnessTest(
  userId: string,
  id: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM fitness_tests WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
