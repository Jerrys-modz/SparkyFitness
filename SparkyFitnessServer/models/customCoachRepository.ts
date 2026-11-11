import {
  CUSTOM_COACHES_MAX,
  normalizeChatToolCategories,
  type CoachResponse,
  type CreateCoachBody,
  type UpdateCoachBody,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';

// A person's own coaches (#2013). The aggregate queries behind the coaching
// chat tools live in coachRepository.ts; this file is only the `coaches` table.

const COACH_COLUMNS = `id, name, description, system_prompt, tool_categories,
  created_at, updated_at`;

export class CoachLimitError extends Error {
  constructor() {
    super(`You can keep at most ${CUSTOM_COACHES_MAX} coaches`);
    this.name = 'CoachLimitError';
  }
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapRow(row: Record<string, unknown>): CoachResponse {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    system_prompt: String(row.system_prompt),
    // Drops a category this server no longer knows, e.g. after a downgrade.
    tool_categories: normalizeChatToolCategories(row.tool_categories) ?? [],
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function listCoaches(userId: string): Promise<CoachResponse[]> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT ${COACH_COLUMNS} FROM coaches
       WHERE user_id = $1 ORDER BY name, created_at`,
      [userId]
    );
    return (result.rows as Record<string, unknown>[]).map(mapRow);
  } finally {
    client.release();
  }
}

export async function getCoach(
  userId: string,
  id: string
): Promise<CoachResponse | null> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT ${COACH_COLUMNS} FROM coaches WHERE user_id = $1 AND id = $2`,
      [userId, id]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Throws CoachLimitError at the cap. */
export async function createCoach(
  userId: string,
  data: CreateCoachBody
): Promise<CoachResponse> {
  const client = await getClient(userId, userId);
  try {
    await client.query('BEGIN');
    // Serialise creates per person so two at once cannot pass the cap check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `coaches:${userId}`,
    ]);
    const count = await client.query(
      'SELECT COUNT(*)::int AS total FROM coaches WHERE user_id = $1',
      [userId]
    );
    if (Number(count.rows[0].total) >= CUSTOM_COACHES_MAX) {
      throw new CoachLimitError();
    }
    const inserted = await client.query(
      `INSERT INTO coaches (
         user_id, name, description, system_prompt, tool_categories
       ) VALUES ($1, $2, $3, $4, $5::text[])
       RETURNING ${COACH_COLUMNS}`,
      [
        userId,
        data.name,
        data.description || null,
        data.system_prompt,
        data.tool_categories,
      ]
    );
    await client.query('COMMIT');
    return mapRow(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Changes only the fields sent; null when the coach is not this person's. */
export async function updateCoach(
  userId: string,
  id: string,
  data: UpdateCoachBody
): Promise<CoachResponse | null> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `UPDATE coaches SET
         name = COALESCE($3, name),
         description = CASE WHEN $4 THEN $5 ELSE description END,
         system_prompt = COALESCE($6, system_prompt),
         tool_categories = COALESCE($7::text[], tool_categories),
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING ${COACH_COLUMNS}`,
      [
        userId,
        id,
        data.name ?? null,
        data.description !== undefined,
        data.description || null,
        data.system_prompt ?? null,
        data.tool_categories ?? null,
      ]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteCoach(
  userId: string,
  id: string
): Promise<boolean> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'DELETE FROM coaches WHERE user_id = $1 AND id = $2',
      [userId, id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
