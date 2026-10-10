import { getClient } from '../db/poolManager.js';
import {
  findProgram,
  runProgramAdjustmentSchema,
  runProgramWorkoutSchema,
  type ProgramState,
  type AdjustResult,
  type RunProgramAdjustment,
  type RunProgramResponse,
  type UpsertRunProgramBody,
} from '@workspace/shared';
import { z } from 'zod';

/** Most change-log entries kept per person. */
const MAX_LOG_ENTRIES = 30;

const workoutsSchema = z.array(runProgramWorkoutSchema);
const logSchema = z.array(runProgramAdjustmentSchema);

function mapRow(row: Record<string, unknown>): RunProgramResponse {
  const workouts = workoutsSchema.safeParse(row.workouts);
  const log = logSchema.safeParse(row.adjustment_log);
  return {
    id: String(row.id),
    program_id: String(row.program_id),
    enabled: Boolean(row.enabled),
    next_index: Number(row.next_index),
    workouts: workouts.success ? workouts.data : [],
    adjustment_log: log.success ? log.data : [],
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getRunProgram(
  userId: string,
  authenticatedUserId?: string
): Promise<RunProgramResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT * FROM run_programs WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Thrown for a program id the server does not know. */
export class UnknownRunProgramError extends Error {}

/**
 * Creates the person's program from the built-in one, or changes the switch
 * and place of the one they have. Choosing a different program replaces the
 * workouts (and the place restarts unless one is given).
 */
export async function upsertRunProgram(
  userId: string,
  body: UpsertRunProgramBody,
  authenticatedUserId?: string
): Promise<RunProgramResponse> {
  const template = findProgram(body.program_id);
  if (!template) throw new UnknownRunProgramError(body.program_id);

  const client = await getClient(userId, authenticatedUserId);
  try {
    const existing = await client.query(
      'SELECT program_id FROM run_programs WHERE user_id = $1',
      [userId]
    );
    const sameProgram = existing.rows[0]?.program_id === body.program_id;
    if (!existing.rows[0] || !sameProgram) {
      const next = Math.min(body.next_index ?? 0, template.workouts.length);
      const result = await client.query(
        `INSERT INTO run_programs
           (user_id, program_id, enabled, next_index, workouts, adjustment_log)
         VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb)
         ON CONFLICT ON CONSTRAINT uq_run_programs_user DO UPDATE SET
           program_id = EXCLUDED.program_id,
           enabled = EXCLUDED.enabled,
           next_index = EXCLUDED.next_index,
           workouts = EXCLUDED.workouts,
           adjustment_log = '[]'::jsonb,
           updated_at = NOW()
         RETURNING *`,
        [
          userId,
          body.program_id,
          body.enabled ?? true,
          next,
          JSON.stringify(template.workouts),
        ]
      );
      return mapRow(result.rows[0]);
    }
    const result = await client.query(
      `UPDATE run_programs SET
         enabled = COALESCE($2, enabled),
         next_index = LEAST(COALESCE($3, next_index), jsonb_array_length(workouts)),
         updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, body.enabled ?? null, body.next_index ?? null]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Moves on from workout `index`, but only if it is the one due, in one
 * statement so a repeated request cannot skip a workout. Returns null when
 * there is no program or the index was not the due one.
 */
export async function completeRunProgramWorkout(
  userId: string,
  index: number,
  authenticatedUserId?: string
): Promise<RunProgramResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE run_programs SET next_index = next_index + 1, updated_at = NOW()
       WHERE user_id = $1 AND next_index = $2
         AND next_index < jsonb_array_length(workouts)
       RETURNING *`,
      [userId, index]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Reads the program under a row lock, lets `change` compute the new workouts
 * and place, and saves them with a log entry. `change` may throw to refuse.
 * Returns null when the person has no program.
 */
export async function adjustRunProgram(
  userId: string,
  source: RunProgramAdjustment['source'],
  change: (state: ProgramState) => AdjustResult,
  authenticatedUserId?: string
): Promise<RunProgramResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT * FROM run_programs WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const program = mapRow(current.rows[0]);
    const result = change({
      workouts: program.workouts,
      next: program.next_index,
    });
    const log: RunProgramAdjustment[] = [
      ...program.adjustment_log,
      { at: new Date().toISOString(), summary: result.summary, source },
    ].slice(-MAX_LOG_ENTRIES);
    const updated = await client.query(
      `UPDATE run_programs SET workouts = $2::jsonb, next_index = $3,
         adjustment_log = $4::jsonb, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [
        userId,
        JSON.stringify(result.workouts),
        result.next,
        JSON.stringify(log),
      ]
    );
    await client.query('COMMIT');
    return mapRow(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
