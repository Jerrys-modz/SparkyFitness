import { getClient } from '../db/poolManager.js';
import type { DietPhaseInput, DietPhaseType } from '@workspace/shared';

/** A stored phase, dates as YYYY-MM-DD text. */
export interface DietPhaseRecord {
  id: string;
  phase_type: DietPhaseType;
  weekly_change_kg: number;
  start_date: string;
  end_date: string | null;
  duration_weeks: number | null;
  target_weight_kg: number | null;
  target_reached_on: string | null;
  label: string | null;
}

/** A phase to save: the client's fields plus the reached day the server keeps. */
export type DietPhaseToSave = DietPhaseInput & {
  target_reached_on: string | null;
};

/** The dates as text: the driver would turn a DATE into a JS Date. */
const COLUMNS = `id, phase_type, weekly_change_kg, duration_weeks,
  target_weight_kg, label,
  to_char(start_date, 'YYYY-MM-DD') AS start_day,
  to_char(end_date, 'YYYY-MM-DD') AS end_day,
  to_char(target_reached_on, 'YYYY-MM-DD') AS reached_day`;

function mapRow(row: Record<string, unknown>): DietPhaseRecord {
  return {
    id: String(row.id),
    phase_type: row.phase_type as DietPhaseType,
    weekly_change_kg: Number(row.weekly_change_kg),
    start_date: String(row.start_day),
    end_date: row.end_day ? String(row.end_day) : null,
    duration_weeks:
      row.duration_weeks === null ? null : Number(row.duration_weeks),
    target_weight_kg:
      row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    target_reached_on: row.reached_day ? String(row.reached_day) : null,
    label: row.label ? String(row.label) : null,
  };
}

/** Every phase of the person, in start order. */
export async function getDietPhases(
  userId: string,
  authenticatedUserId?: string
): Promise<DietPhaseRecord[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM diet_phases WHERE user_id = $1
       ORDER BY start_date, created_at`,
      [userId]
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

/**
 * Replaces the person's plan in one transaction. `check` sees the phases as
 * stored once the plan is locked and returns the rows to write (or throws to
 * refuse), so two saves at once cannot both pass the overlap and past-day
 * checks against the same old plan. Phases keep their id when sent with it.
 */
export async function replaceDietPhases(
  userId: string,
  check: (existing: DietPhaseRecord[]) => DietPhaseToSave[],
  authenticatedUserId?: string
): Promise<DietPhaseRecord[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('diet_phases:' || $1::text))",
      [userId]
    );
    const existingResult = await client.query(
      `SELECT ${COLUMNS} FROM diet_phases WHERE user_id = $1
       ORDER BY start_date, created_at`,
      [userId]
    );
    const phases = check(existingResult.rows.map(mapRow));
    const keepIds = phases
      .map((phase) => phase.id)
      .filter((id): id is string => typeof id === 'string');
    await client.query(
      'DELETE FROM diet_phases WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))',
      [userId, keepIds]
    );
    for (const phase of phases) {
      const values = [
        userId,
        phase.phase_type,
        phase.weekly_change_kg,
        phase.start_date,
        phase.end_date,
        phase.duration_weeks,
        phase.target_weight_kg,
        phase.target_reached_on,
        phase.label || null,
      ];
      if (phase.id) {
        await client.query(
          `UPDATE diet_phases SET phase_type = $2, weekly_change_kg = $3,
             start_date = $4, end_date = $5, duration_weeks = $6,
             target_weight_kg = $7, target_reached_on = $8, label = $9,
             updated_at = NOW()
           WHERE user_id = $1 AND id = $10`,
          [...values, phase.id]
        );
      } else {
        await client.query(
          `INSERT INTO diet_phases (user_id, phase_type, weekly_change_kg,
             start_date, end_date, duration_weeks, target_weight_kg,
             target_reached_on, label)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          values
        );
      }
    }
    const saved = await client.query(
      `SELECT ${COLUMNS} FROM diet_phases WHERE user_id = $1
       ORDER BY start_date, created_at`,
      [userId]
    );
    await client.query('COMMIT');
    return saved.rows.map(mapRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records the day a phase's weight target was reached, once. Under a
 * delegate's context RLS lets the update touch no row, which is fine: the
 * phase still ends that day in memory and the owner's next load records it.
 */
export async function markDietPhaseTargetReached(
  userId: string,
  phaseId: string,
  day: string,
  authenticatedUserId?: string
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      `UPDATE diet_phases SET target_reached_on = $3, updated_at = NOW()
       WHERE user_id = $1 AND id = $2 AND target_reached_on IS NULL`,
      [userId, phaseId, day]
    );
  } finally {
    client.release();
  }
}

/** Logged weights (kg) from `startDate` to `endDate`, for the phase target check. */
export async function getWeightsInRange(
  userId: string,
  startDate: string,
  endDate: string,
  authenticatedUserId?: string
): Promise<{ date: string; weight: number }[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS day, weight
       FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL
         AND entry_date BETWEEN $2::date AND $3::date
       ORDER BY entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows.map((row: { day: string; weight: string | number }) => ({
      date: row.day,
      weight: Number(row.weight),
    }));
  } finally {
    client.release();
  }
}

export default {
  getDietPhases,
  replaceDietPhases,
  markDietPhaseTargetReached,
  getWeightsInRange,
};
