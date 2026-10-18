import { getClient } from '../db/poolManager.js';
import {
  SEGMENT_MAX_PER_USER,
  type Segment,
  type SegmentSummary,
  type TrackFix,
} from '@workspace/shared';
import type { RouteBounds } from '@workspace/shared';
import { z } from 'zod';

export class SegmentLimitError extends Error {}

type SegmentActivity = Segment['activity'];

interface SegmentRow {
  id: string;
  name: string | null;
  activity: SegmentActivity;
  length_m: number;
  points: unknown;
  source_route_id: string | null;
  source_exercise_entry_id: string | null;
  effort_count: number;
  best_seconds: number | null;
  last_effort_date: string | null;
  created_at: Date;
  updated_at: Date;
}

const latLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
const pointsSchema = z.array(latLonSchema);

/**
 * The person's own history on a segment, as columns of a `segments` row. Rows
 * with a null `elapsed_seconds` are cached "no pass" results and do not count.
 */
const EFFORT_STATS_COLUMNS = `
  (SELECT COUNT(*)::int FROM segment_efforts f
     WHERE f.segment_id = segments.id AND f.elapsed_seconds IS NOT NULL)
     AS effort_count,
  (SELECT MIN(f.elapsed_seconds) FROM segment_efforts f
     WHERE f.segment_id = segments.id AND f.elapsed_seconds IS NOT NULL)
     AS best_seconds,
  (SELECT to_char(MAX(f.entry_date), 'YYYY-MM-DD') FROM segment_efforts f
     WHERE f.segment_id = segments.id AND f.elapsed_seconds IS NOT NULL)
     AS last_effort_date`;

const SEGMENT_COLUMNS = `id, name, activity, length_m, points,
  source_route_id, source_exercise_entry_id, created_at, updated_at,
  ${EFFORT_STATS_COLUMNS}`;

function mapSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    lengthM: row.length_m,
    points: pointsSchema.catch([]).parse(row.points),
    sourceRouteId: row.source_route_id,
    sourceExerciseEntryId: row.source_exercise_entry_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSummary(row: SegmentRow): SegmentSummary {
  const points = pointsSchema.catch([]).parse(row.points);
  const first = points[0];
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    lengthM: row.length_m,
    sourceRouteId: row.source_route_id,
    sourceExerciseEntryId: row.source_exercise_entry_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    start: first ?? null,
    effortCount: row.effort_count,
    bestSeconds: row.best_seconds,
    lastEffortDate: row.last_effort_date,
  };
}

/** The person's segments, most recently changed first. */
export async function listSegments(
  userId: string,
  authenticatedUserId?: string
): Promise<SegmentSummary[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${SEGMENT_COLUMNS} FROM segments
        WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    )) as { rows: SegmentRow[] };
    return result.rows.map(mapSummary);
  } finally {
    client.release();
  }
}

export async function getSegmentRow(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string
): Promise<{ segment: Segment; summary: SegmentSummary } | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${SEGMENT_COLUMNS} FROM segments WHERE id = $1 AND user_id = $2`,
      [segmentId, userId]
    )) as { rows: SegmentRow[] };
    const row = result.rows[0];
    return row ? { segment: mapSegment(row), summary: mapSummary(row) } : null;
  } finally {
    client.release();
  }
}

export interface NewSegment {
  name: string | null;
  activity: SegmentActivity;
  lengthM: number;
  points: Array<{ lat: number; lon: number }>;
  bounds: RouteBounds;
  sourceRouteId: string | null;
  sourceExerciseEntryId: string | null;
}

/** Creates a segment; sources that are not the person's are stored as null. */
export async function createSegment(
  userId: string,
  input: NewSegment,
  authenticatedUserId?: string
): Promise<SegmentSummary> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Serialize one person's creates so two at once cannot both pass the limit.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `segments:${userId}`,
    ]);
    const count = (await client.query(
      'SELECT COUNT(*)::int AS n FROM segments WHERE user_id = $1',
      [userId]
    )) as { rows: Array<{ n: number }> };
    if (count.rows[0].n >= SEGMENT_MAX_PER_USER) {
      await client.query('ROLLBACK');
      throw new SegmentLimitError();
    }
    const result = (await client.query(
      `INSERT INTO segments
         (user_id, name, activity, length_m, points,
          min_lat, min_lon, max_lat, max_lon,
          source_route_id, source_exercise_entry_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9,
         (SELECT id FROM routes WHERE id = $10 AND user_id = $1),
         (SELECT id FROM exercise_entries WHERE id = $11 AND user_id = $1))
       RETURNING id, name, activity, length_m, points,
         source_route_id, source_exercise_entry_id, created_at, updated_at,
         0 AS effort_count, NULL::float8 AS best_seconds,
         NULL::text AS last_effort_date`,
      [
        userId,
        input.name,
        input.activity,
        input.lengthM,
        JSON.stringify(input.points),
        input.bounds.minLat,
        input.bounds.minLon,
        input.bounds.maxLat,
        input.bounds.maxLon,
        input.sourceRouteId,
        input.sourceExerciseEntryId,
      ]
    )) as { rows: SegmentRow[] };
    await client.query('COMMIT');
    return mapSummary(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function renameSegment(
  userId: string,
  segmentId: string,
  name: string | null,
  authenticatedUserId?: string
): Promise<SegmentSummary | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `UPDATE segments SET name = $3, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING ${SEGMENT_COLUMNS}`,
      [segmentId, userId, name]
    )) as { rows: SegmentRow[] };
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteSegment(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      'DELETE FROM segments WHERE id = $1 AND user_id = $2',
      [segmentId, userId]
    )) as { rowCount: number | null };
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** A segment as the matcher needs it. */
export interface MatchableSegment {
  id: string;
  activity: SegmentActivity;
  lengthM: number;
  points: Array<{ lat: number; lon: number }>;
  bounds: RouteBounds;
}

interface MatchableRow {
  id: string;
  activity: SegmentActivity;
  length_m: number;
  points: unknown;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

function mapMatchable(row: MatchableRow): MatchableSegment {
  return {
    id: row.id,
    activity: row.activity,
    lengthM: row.length_m,
    points: pointsSchema.catch([]).parse(row.points),
    bounds: {
      minLat: row.min_lat,
      minLon: row.min_lon,
      maxLat: row.max_lat,
      maxLon: row.max_lon,
    },
  };
}

const MATCHABLE_COLUMNS =
  'id, activity, length_m, points, min_lat, min_lon, max_lat, max_lon';

export async function getMatchableSegment(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string
): Promise<MatchableSegment | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${MATCHABLE_COLUMNS} FROM segments WHERE id = $1 AND user_id = $2`,
      [segmentId, userId]
    )) as { rows: MatchableRow[] };
    return result.rows[0] ? mapMatchable(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Segments with no cached result (a pass or a "no pass") for this activity yet. */
export async function listSegmentsToMatchForEntry(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<MatchableSegment[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${MATCHABLE_COLUMNS} FROM segments s
        WHERE s.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM segment_efforts f
             WHERE f.segment_id = s.id AND f.exercise_entry_id = $2)`,
      [userId, exerciseEntryId]
    )) as { rows: MatchableRow[] };
    return result.rows.map(mapMatchable);
  } finally {
    client.release();
  }
}

export interface CandidateEntry {
  entryId: string;
  entryDate: string;
  exerciseName: string | null;
  category: string | null;
  notes: string | null;
}

interface CandidateRow {
  entry_id: string;
  entry_date: string;
  exercise_name: string | null;
  category: string | null;
  notes: string | null;
}

/**
 * Activities with a GPS track that has at least one fix inside the segment's
 * box (plus `marginDeg`) and no cached result for the segment yet, newest
 * first. The box test runs in Postgres, so tracks that never came near are
 * not sent to Node at all.
 */
export async function listUnmatchedCandidates(
  userId: string,
  segment: MatchableSegment,
  limit: number,
  marginDeg: number,
  authenticatedUserId?: string
): Promise<CandidateEntry[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const { bounds } = segment;
    const result = (await client.query(
      `SELECT p.exercise_entry_id AS entry_id,
              to_char(p.entry_date, 'YYYY-MM-DD') AS entry_date,
              ee.exercise_name, ee.category, ee.notes
         FROM exercise_entry_gps_points p
         JOIN exercise_entries ee ON ee.id = p.exercise_entry_id
        WHERE p.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM segment_efforts f
             WHERE f.segment_id = $2 AND f.exercise_entry_id = p.exercise_entry_id)
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(p.points) e
             WHERE CASE WHEN jsonb_typeof(e->'lat') = 'number'
                         AND jsonb_typeof(e->'lon') = 'number'
                        THEN (e->>'lat')::float8 BETWEEN $3 AND $4
                         AND (e->>'lon')::float8 BETWEEN $5 AND $6
                        ELSE false END)
        ORDER BY p.entry_date DESC, p.exercise_entry_id
        LIMIT $7`,
      [
        userId,
        segment.id,
        bounds.minLat - marginDeg,
        bounds.maxLat + marginDeg,
        bounds.minLon - marginDeg,
        bounds.maxLon + marginDeg,
        limit,
      ]
    )) as { rows: CandidateRow[] };
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

const storedFixSchema = z.object({
  t: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  hacc: z.number().optional(),
});

export interface EntryTrack {
  entryDate: string;
  exerciseName: string | null;
  category: string | null;
  notes: string | null;
  fixes: TrackFix[];
}

/** One activity's GPS fixes in the shape the matcher reads, or null without a track. */
export async function getEntryTrackFixes(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<EntryTrack | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT to_char(p.entry_date, 'YYYY-MM-DD') AS entry_date,
              ee.exercise_name, ee.category, ee.notes, p.points
         FROM exercise_entry_gps_points p
         JOIN exercise_entries ee ON ee.id = p.exercise_entry_id
        WHERE p.exercise_entry_id = $1 AND p.user_id = $2`,
      [exerciseEntryId, userId]
    )) as {
      rows: Array<{
        entry_date: string;
        exercise_name: string | null;
        category: string | null;
        notes: string | null;
        points: unknown;
      }>;
    };
    const row = result.rows[0];
    if (!row || !Array.isArray(row.points)) return null;
    const fixes: TrackFix[] = [];
    for (const raw of row.points) {
      const parsed = storedFixSchema.safeParse(raw);
      if (!parsed.success) continue;
      const tMs = Date.parse(parsed.data.t);
      if (!Number.isFinite(tMs)) continue;
      fixes.push({
        tMs,
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        ...(parsed.data.hacc !== undefined ? { hacc: parsed.data.hacc } : {}),
      });
    }
    return {
      entryDate: row.entry_date,
      exerciseName: row.exercise_name,
      category: row.category,
      notes: row.notes,
      fixes,
    };
  } finally {
    client.release();
  }
}

export interface EffortWrite {
  segmentId: string;
  exerciseEntryId: string;
  entryDate: string;
  /** Null for a cached "no valid pass". */
  pass: {
    startedAtMs: number;
    elapsedSeconds: number;
    avgSpeedMps: number;
  } | null;
}

/** Stores results; a repeat for the same (segment, activity) replaces the earlier one. */
export async function saveEfforts(
  userId: string,
  efforts: readonly EffortWrite[],
  authenticatedUserId?: string
): Promise<void> {
  if (efforts.length === 0) return;
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    for (const effort of efforts) {
      await client.query(
        `INSERT INTO segment_efforts
           (user_id, segment_id, exercise_entry_id, entry_date,
            started_at, elapsed_seconds, avg_speed_mps)
         SELECT $1, s.id, $3, $4,
                CASE WHEN $5::float8 IS NULL THEN NULL
                     ELSE to_timestamp($5::float8 / 1000.0) END,
                $6, $7
           FROM segments s WHERE s.id = $2 AND s.user_id = $1
         ON CONFLICT (segment_id, exercise_entry_id) DO UPDATE
            SET started_at = EXCLUDED.started_at,
                elapsed_seconds = EXCLUDED.elapsed_seconds,
                avg_speed_mps = EXCLUDED.avg_speed_mps,
                entry_date = EXCLUDED.entry_date`,
        [
          userId,
          effort.segmentId,
          effort.exerciseEntryId,
          effort.entryDate,
          effort.pass?.startedAtMs ?? null,
          effort.pass?.elapsedSeconds ?? null,
          effort.pass?.avgSpeedMps ?? null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Forgets every cached result for an activity (its track was replaced). */
export async function clearEntryEfforts(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      'DELETE FROM segment_efforts WHERE exercise_entry_id = $1 AND user_id = $2',
      [exerciseEntryId, userId]
    );
  } finally {
    client.release();
  }
}

export interface StoredEffort {
  segmentId: string;
  entryId: string;
  date: string;
  startedAtMs: number;
  elapsedSeconds: number;
  avgSpeedMps: number;
}

interface EffortRow {
  segment_id: string;
  entry_id: string;
  entry_date: string;
  started_ms: number;
  elapsed_seconds: number;
  avg_speed_mps: number;
}

const EFFORT_SELECT = `SELECT f.segment_id, f.exercise_entry_id AS entry_id,
       to_char(f.entry_date, 'YYYY-MM-DD') AS entry_date,
       (EXTRACT(EPOCH FROM f.started_at) * 1000)::float8 AS started_ms,
       f.elapsed_seconds, f.avg_speed_mps
  FROM segment_efforts f`;

function mapEffort(row: EffortRow): StoredEffort {
  return {
    segmentId: row.segment_id,
    entryId: row.entry_id,
    date: row.entry_date,
    startedAtMs: row.started_ms,
    elapsedSeconds: row.elapsed_seconds,
    avgSpeedMps: row.avg_speed_mps,
  };
}

/** Every valid effort on a segment, oldest first (capped at 2000). */
export async function listSegmentEfforts(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string
): Promise<StoredEffort[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `${EFFORT_SELECT}
        WHERE f.segment_id = $1 AND f.user_id = $2
          AND f.elapsed_seconds IS NOT NULL
        ORDER BY f.started_at ASC
        LIMIT 2000`,
      [segmentId, userId]
    )) as { rows: EffortRow[] };
    return result.rows.map(mapEffort);
  } finally {
    client.release();
  }
}

export interface EntryEffortContext {
  effort: StoredEffort;
  segmentName: string | null;
  segmentLengthM: number;
  /** Elapsed seconds of the person's efforts on that segment from other activities. */
  otherElapsed: number[];
}

/** The efforts one activity made, each with the other activities' times on the same segment. */
export async function listEntryEfforts(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<EntryEffortContext[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const mine = (await client.query(
      `${EFFORT_SELECT}
        WHERE f.exercise_entry_id = $1 AND f.user_id = $2
          AND f.elapsed_seconds IS NOT NULL
        ORDER BY f.started_at ASC`,
      [exerciseEntryId, userId]
    )) as { rows: EffortRow[] };
    if (mine.rows.length === 0) return [];
    const ids = mine.rows.map((r) => r.segment_id);
    const segments = (await client.query(
      'SELECT id, name, length_m FROM segments WHERE id = ANY($1::uuid[]) AND user_id = $2',
      [ids, userId]
    )) as {
      rows: Array<{ id: string; name: string | null; length_m: number }>;
    };
    const others = (await client.query(
      `SELECT f.segment_id, f.elapsed_seconds
         FROM segment_efforts f
        WHERE f.segment_id = ANY($1::uuid[]) AND f.user_id = $2
          AND f.exercise_entry_id <> $3 AND f.elapsed_seconds IS NOT NULL`,
      [ids, userId, exerciseEntryId]
    )) as { rows: Array<{ segment_id: string; elapsed_seconds: number }> };
    return mine.rows.flatMap((row) => {
      const segment = segments.rows.find((s) => s.id === row.segment_id);
      if (!segment) return [];
      return [
        {
          effort: mapEffort(row),
          segmentName: segment.name,
          segmentLengthM: segment.length_m,
          otherElapsed: others.rows
            .filter((o) => o.segment_id === row.segment_id)
            .map((o) => o.elapsed_seconds),
        },
      ];
    });
  } finally {
    client.release();
  }
}
