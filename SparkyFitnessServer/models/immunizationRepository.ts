import { getClient } from '../db/poolManager.js';
import type {
  CreateImmunizationBody,
  ImmunizationExtractionRecord,
  ImmunizationListQuery,
  ImmunizationResponse,
  ImmunizationSource,
  UpdateImmunizationBody,
} from '@workspace/shared';

const toIso = (value: unknown): string =>
  new Date(value as string).toISOString();

const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toStringOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/** A DATE column comes back as a Date or an ISO string; keep only the day. */
const toDayOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.split('T')[0] ?? text;
};

function mapRow(row: Record<string, unknown>): ImmunizationResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    vaccine_name: String(row.vaccine_name),
    vaccine_code: toStringOrNull(row.vaccine_code),
    administered_on: toDayOrNull(row.administered_on) ?? '',
    dose_number: toNumberOrNull(row.dose_number),
    lot_number: toStringOrNull(row.lot_number),
    administered_by: toStringOrNull(row.administered_by),
    site: toStringOrNull(row.site),
    next_due_on: toDayOrNull(row.next_due_on),
    notes: toStringOrNull(row.notes),
    source: String(row.source) as ImmunizationSource,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function listImmunizations(
  userId: string,
  query: ImmunizationListQuery,
  authenticatedUserId?: string
): Promise<ImmunizationResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const conditions = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (query.startDate) {
      params.push(query.startDate);
      conditions.push(`administered_on >= $${params.length}`);
    }
    if (query.endDate) {
      params.push(query.endDate);
      conditions.push(`administered_on <= $${params.length}`);
    }
    params.push(query.limit);
    const result = await client.query(
      `SELECT * FROM immunizations
       WHERE ${conditions.join(' AND ')}
       ORDER BY administered_on DESC, created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function getImmunizationById(
  userId: string,
  id: string,
  authenticatedUserId?: string
): Promise<ImmunizationResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT * FROM immunizations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function createImmunization(
  userId: string,
  data: CreateImmunizationBody,
  authenticatedUserId?: string
): Promise<ImmunizationResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO immunizations (
        user_id, vaccine_name, vaccine_code, administered_on, dose_number,
        lot_number, administered_by, site, next_due_on, notes, source,
        created_by_user_id, updated_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      RETURNING *`,
      [
        userId,
        data.vaccine_name,
        data.vaccine_code ?? null,
        data.administered_on,
        data.dose_number ?? null,
        data.lot_number ?? null,
        data.administered_by ?? null,
        data.site ?? null,
        data.next_due_on ?? null,
        data.notes ?? null,
        data.source,
        authenticatedUserId ?? userId,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Partial update: only the fields the caller sent change, and an explicit
 * `null` clears an optional one.
 */
export async function updateImmunization(
  userId: string,
  id: string,
  data: UpdateImmunizationBody,
  authenticatedUserId?: string
): Promise<ImmunizationResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const fields: Record<string, unknown> = {
      vaccine_name: data.vaccine_name,
      vaccine_code: data.vaccine_code,
      administered_on: data.administered_on,
      dose_number: data.dose_number,
      lot_number: data.lot_number,
      administered_by: data.administered_by,
      site: data.site,
      next_due_on: data.next_due_on,
      notes: data.notes,
    };
    const entries = Object.entries(fields).filter(
      ([, value]) => value !== undefined
    );
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 4}`)
      .join(', ');
    const result = await client.query(
      `UPDATE immunizations
       SET ${assignments ? `${assignments}, ` : ''}updated_by_user_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        authenticatedUserId ?? userId,
        ...entries.map(([, value]) => value),
      ]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteImmunization(
  userId: string,
  id: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM immunizations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Saves the reviewed records of one scan, all or none, as `import` records.
 * Returns how many were created.
 */
export async function importImmunizations(
  userId: string,
  records: ImmunizationExtractionRecord[],
  authenticatedUserId?: string
): Promise<number> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    for (const record of records) {
      await client.query(
        `INSERT INTO immunizations (
          user_id, vaccine_name, administered_on, dose_number, lot_number,
          administered_by, site, source, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'import', $8, $8)`,
        [
          userId,
          record.vaccine_name,
          record.administered_on,
          record.dose_number,
          record.lot_number,
          record.administered_by,
          record.site,
          authenticatedUserId ?? userId,
        ]
      );
    }
    await client.query('COMMIT');
    return records.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
