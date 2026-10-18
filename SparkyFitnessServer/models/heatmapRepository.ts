import { getClient } from '../db/poolManager.js';
import type { HeatFix } from '@workspace/shared';

export interface HeatEntry {
  entryId: string;
  entryDate: string;
  exerciseName: string | null;
  category: string | null;
  notes: string | null;
}

/**
 * Activities with a stored GPS track in a date range, newest first. Only
 * ids, days and names come back (a few dozen bytes each); the tracks are
 * read separately in small batches.
 */
export async function listHeatEntries(
  userId: string,
  from: string | null,
  to: string | null,
  authenticatedUserId?: string,
  updatedAfter: string | null = null
): Promise<HeatEntry[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT p.exercise_entry_id AS entry_id,
              to_char(p.entry_date, 'YYYY-MM-DD') AS entry_date,
              ee.exercise_name, ee.category, ee.notes
         FROM exercise_entry_gps_points p
         JOIN exercise_entries ee ON ee.id = p.exercise_entry_id
        WHERE p.user_id = $1
          AND ($2::date IS NULL OR p.entry_date >= $2::date)
          AND ($3::date IS NULL OR p.entry_date <= $3::date)
          AND ($4::timestamptz IS NULL OR p.updated_at > $4::timestamptz)
        ORDER BY p.entry_date DESC, p.exercise_entry_id`,
      [userId, from, to, updatedAfter]
    )) as {
      rows: Array<{
        entry_id: string;
        entry_date: string;
        exercise_name: string | null;
        category: string | null;
        notes: string | null;
      }>;
    };
    return result.rows.map((row) => ({
      entryId: row.entry_id,
      entryDate: row.entry_date,
      exerciseName: row.exercise_name,
      category: row.category,
      notes: row.notes,
    }));
  } finally {
    client.release();
  }
}

export interface HeatStamp {
  /** Stored tracks in the range. */
  count: number;
  /** Newest `updated_at` among them, as Postgres prints it; null with none. */
  last: string | null;
}

/**
 * A cheap fingerprint of the person's stored tracks in a range: how many
 * there are and when one last changed. A cached heatmap is reused while it
 * stays the same, so a new, replaced or deleted activity rebuilds it.
 */
export async function getHeatStamp(
  userId: string,
  from: string | null,
  to: string | null,
  authenticatedUserId?: string
): Promise<HeatStamp> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT COUNT(*)::int AS n, MAX(p.updated_at)::text AS last
         FROM exercise_entry_gps_points p
        WHERE p.user_id = $1
          AND ($2::date IS NULL OR p.entry_date >= $2::date)
          AND ($3::date IS NULL OR p.entry_date <= $3::date)`,
      [userId, from, to]
    )) as { rows: Array<{ n: number; last: string | null }> };
    const row = result.rows[0];
    return { count: row?.n ?? 0, last: row?.last ?? null };
  } finally {
    client.release();
  }
}

/** How many stored tracks in the range changed after `last` (see `HeatStamp`). */
export async function countHeatRowsAfter(
  userId: string,
  from: string | null,
  to: string | null,
  last: string,
  authenticatedUserId?: string
): Promise<number> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT COUNT(*)::int AS n
         FROM exercise_entry_gps_points p
        WHERE p.user_id = $1
          AND ($2::date IS NULL OR p.entry_date >= $2::date)
          AND ($3::date IS NULL OR p.entry_date <= $3::date)
          AND p.updated_at > $4::timestamptz`,
      [userId, from, to, last]
    )) as { rows: Array<{ n: number }> };
    return result.rows[0]?.n ?? 0;
  } finally {
    client.release();
  }
}

interface StoredFix {
  t?: unknown;
  lat?: unknown;
  lon?: unknown;
  hacc?: unknown;
}

/** The fixes of a few activities, keyed by entry id. */
export async function getTrackBatch(
  userId: string,
  entryIds: readonly string[],
  authenticatedUserId?: string
): Promise<Map<string, HeatFix[]>> {
  const out = new Map<string, HeatFix[]>();
  if (entryIds.length === 0) return out;
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT exercise_entry_id AS entry_id, points
         FROM exercise_entry_gps_points
        WHERE user_id = $1 AND exercise_entry_id = ANY($2::uuid[])`,
      [userId, entryIds]
    )) as { rows: Array<{ entry_id: string; points: unknown }> };
    for (const row of result.rows) {
      if (!Array.isArray(row.points)) continue;
      const fixes: HeatFix[] = [];
      // Hand-checked rather than Zod-parsed: this runs once per fix.
      for (const raw of row.points as StoredFix[]) {
        if (typeof raw?.lat !== 'number' || typeof raw.lon !== 'number') {
          continue;
        }
        const tMs = typeof raw.t === 'string' ? Date.parse(raw.t) : NaN;
        fixes.push({
          lat: raw.lat,
          lon: raw.lon,
          ...(Number.isFinite(tMs) ? { tMs } : {}),
          ...(typeof raw.hacc === 'number' ? { hacc: raw.hacc } : {}),
        });
      }
      out.set(row.entry_id, fixes);
    }
    return out;
  } finally {
    client.release();
  }
}
