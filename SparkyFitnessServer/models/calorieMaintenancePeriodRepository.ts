import { getClient } from '../db/poolManager.js';
import type {
  CalorieMaintenancePeriod,
  CreateCalorieMaintenancePeriodBody,
} from '@workspace/shared';

// Dates are formatted in SQL so they stay calendar-day strings instead of
// passing through a JS Date.
const COLUMNS = `id, kind, note,
  to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date, 'YYYY-MM-DD') AS end_date`;

function mapRow(row: Record<string, unknown>): CalorieMaintenancePeriod {
  return {
    id: String(row.id),
    kind: row.kind as CalorieMaintenancePeriod['kind'],
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    note: row.note ? String(row.note) : null,
  };
}

/** The periods that touch `from`..`to` (either may be omitted), oldest first. */
export async function getCalorieMaintenancePeriods(
  userId: string,
  authenticatedUserId: string,
  from?: string,
  to?: string
): Promise<CalorieMaintenancePeriod[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM calorie_maintenance_periods
       WHERE user_id = $1
         AND ($2::date IS NULL OR end_date >= $2::date)
         AND ($3::date IS NULL OR start_date <= $3::date)
       ORDER BY start_date, created_at`,
      [userId, from ?? null, to ?? null]
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function createCalorieMaintenancePeriod(
  userId: string,
  authenticatedUserId: string,
  body: CreateCalorieMaintenancePeriodBody
): Promise<CalorieMaintenancePeriod> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO calorie_maintenance_periods
         (user_id, kind, start_date, end_date, note)
       VALUES ($1, $2, $3::date, $4::date, $5)
       RETURNING ${COLUMNS}`,
      [
        userId,
        body.kind,
        body.start_date,
        body.end_date ?? body.start_date,
        body.note ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/** True when a row was removed. */
export async function deleteCalorieMaintenancePeriod(
  userId: string,
  authenticatedUserId: string,
  id: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM calorie_maintenance_periods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export default {
  getCalorieMaintenancePeriods,
  createCalorieMaintenancePeriod,
  deleteCalorieMaintenancePeriod,
};
