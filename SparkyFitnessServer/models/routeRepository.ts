import { getClient } from '../db/poolManager.js';
import {
  ROUTE_MAX_PER_USER,
  routeCueSchema,
  routePointSchema,
  type CreateRouteBody,
  type Route,
  type RouteRun,
  type RouteSummary,
  type RoutePoint,
  type UpdateRouteBody,
} from '@workspace/shared';
import { z } from 'zod';
import { InvalidRouteError, prepareRoute } from '../utils/routePrep.js';

export class RouteLimitError extends Error {}
export class ActivityHasNoRouteError extends Error {}
export { InvalidRouteError };

type RouteSource = Route['source'];

interface RouteRow {
  id: string;
  name: string;
  activity: Route['activity'];
  source: RouteSource;
  distance_m: number;
  elevation_gain_m: number | null;
  points: unknown;
  cues: unknown;
  source_exercise_entry_id: string | null;
  run_count: number;
  best_duration_seconds: number | null;
  last_run_date: string | null;
  created_at: Date;
  updated_at: Date;
}

const pointsSchema = z.array(routePointSchema);
const cuesSchema = z.array(routeCueSchema);

/**
 * What the diary says about runs over a route, as columns of a `routes` row
 * (they read `routes.id`, so they work in SELECT and RETURNING alike). The
 * best time is the shortest logged duration; entries with no time are left out.
 */
const RUN_STATS_COLUMNS = `
  (SELECT COUNT(*)::int FROM exercise_entries e
     WHERE e.route_id = routes.id) AS run_count,
  (SELECT MIN(ROUND(e.duration_minutes * 60))::int FROM exercise_entries e
     WHERE e.route_id = routes.id AND e.duration_minutes > 0)
     AS best_duration_seconds,
  (SELECT to_char(MAX(e.entry_date), 'YYYY-MM-DD') FROM exercise_entries e
     WHERE e.route_id = routes.id) AS last_run_date`;

const ROUTE_COLUMNS = `routes.*, ${RUN_STATS_COLUMNS}`;

const SUMMARY_COLUMNS = `id, name, activity, source, distance_m, elevation_gain_m,
  source_exercise_entry_id, created_at, updated_at,
  points -> 0 AS start, jsonb_array_length(points) AS point_count,
  ${RUN_STATS_COLUMNS}`;

interface RouteSummaryRow extends Omit<RouteRow, 'points' | 'cues'> {
  start: unknown;
  point_count: number;
}

function mapRoute(row: RouteRow): Route {
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    source: row.source,
    distanceM: row.distance_m,
    elevationGainM: row.elevation_gain_m,
    points: pointsSchema.catch([]).parse(row.points),
    cues: cuesSchema.catch([]).parse(row.cues),
    sourceExerciseEntryId: row.source_exercise_entry_id,
    runCount: row.run_count,
    bestDurationSeconds: row.best_duration_seconds,
    lastRunDate: row.last_run_date,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSummary(row: RouteSummaryRow): RouteSummary {
  const start = routePointSchema.safeParse(row.start);
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    source: row.source,
    distanceM: row.distance_m,
    elevationGainM: row.elevation_gain_m,
    sourceExerciseEntryId: row.source_exercise_entry_id,
    runCount: row.run_count,
    bestDurationSeconds: row.best_duration_seconds,
    lastRunDate: row.last_run_date,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    start: start.success ? start.data : null,
    pointCount: row.point_count,
  };
}

export async function listRoutes(
  userId: string,
  authenticatedUserId?: string
): Promise<RouteSummary[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${SUMMARY_COLUMNS} FROM routes WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    )) as { rows: RouteSummaryRow[] };
    return result.rows.map(mapSummary);
  } finally {
    client.release();
  }
}

export async function getRoute(
  userId: string,
  routeId: string,
  authenticatedUserId?: string
): Promise<Route | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${ROUTE_COLUMNS} FROM routes WHERE id = $1 AND user_id = $2`,
      [routeId, userId]
    )) as { rows: RouteRow[] };
    return result.rows[0] ? mapRoute(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export interface NewRoute extends Omit<CreateRouteBody, 'cues'> {
  cues?: CreateRouteBody['cues'];
  source: RouteSource;
  sourceExerciseEntryId?: string | null;
}

export async function createRoute(
  userId: string,
  input: NewRoute,
  authenticatedUserId?: string
): Promise<Route> {
  const prepared = prepareRoute(input.points, input.cues);
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Serialize one person's creates so two at once cannot both pass the
    // limit check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `routes:${userId}`,
    ]);
    const count = (await client.query(
      'SELECT COUNT(*)::int AS n FROM routes WHERE user_id = $1',
      [userId]
    )) as { rows: Array<{ n: number }> };
    if (count.rows[0].n >= ROUTE_MAX_PER_USER) {
      await client.query('ROLLBACK');
      throw new RouteLimitError();
    }
    const result = (await client.query(
      `INSERT INTO routes
         (user_id, name, activity, source, distance_m, elevation_gain_m,
          points, cues, source_exercise_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       RETURNING *, 0 AS run_count, NULL::int AS best_duration_seconds,
                 NULL::text AS last_run_date`,
      [
        userId,
        input.name,
        input.activity,
        input.source,
        prepared.distanceM,
        prepared.elevationGainM,
        JSON.stringify(prepared.points),
        JSON.stringify(prepared.cues),
        input.sourceExerciseEntryId ?? null,
      ]
    )) as { rows: RouteRow[] };
    await client.query('COMMIT');
    return mapRoute(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoute(
  userId: string,
  routeId: string,
  patch: UpdateRouteBody,
  authenticatedUserId?: string
): Promise<Route | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `UPDATE routes
          SET name = COALESCE($3, name),
              activity = COALESCE($4, activity),
              updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING routes.*, ${RUN_STATS_COLUMNS}`,
      [routeId, userId, patch.name ?? null, patch.activity ?? null]
    )) as { rows: RouteRow[] };
    return result.rows[0] ? mapRoute(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteRoute(
  userId: string,
  routeId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      'DELETE FROM routes WHERE id = $1 AND user_id = $2',
      [routeId, userId]
    )) as { rowCount: number | null };
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

interface ActivityRow {
  exercise_name: string | null;
  entry_date: string | Date;
  points: unknown;
}

const trackPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  alt: z.number().min(-1000).max(10000).optional(),
});

/** The GPS track of a recorded activity, or null if the entry is not theirs or has none. */
export async function getActivityTrack(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<{ name: string | null; points: RoutePoint[] } | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ee.exercise_name, p.entry_date, p.points
         FROM exercise_entry_gps_points p
         JOIN exercise_entries ee ON ee.id = p.exercise_entry_id
        WHERE p.exercise_entry_id = $1 AND p.user_id = $2`,
      [exerciseEntryId, userId]
    )) as { rows: ActivityRow[] };
    const row = result.rows[0];
    if (!row || !Array.isArray(row.points)) return null;
    const points: RoutePoint[] = [];
    for (const raw of row.points) {
      const parsed = trackPointSchema.safeParse(raw);
      if (parsed.success) points.push(parsed.data);
    }
    return { name: row.exercise_name, points };
  } finally {
    client.release();
  }
}

interface RouteRunRow {
  entry_id: string;
  entry_date: string;
  duration_seconds: number;
  distance_m: number | null;
  avg_heart_rate: number | null;
}

/**
 * The diary entries that followed a route, newest first, or null when the
 * route is not the person's. Pace is worked out here from the logged time and
 * distance so every client shows the same figure.
 */
export async function listRouteRuns(
  userId: string,
  routeId: string,
  authenticatedUserId?: string
): Promise<RouteRun[] | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const owned = (await client.query(
      'SELECT 1 FROM routes WHERE id = $1 AND user_id = $2',
      [routeId, userId]
    )) as { rows: unknown[] };
    if (owned.rows.length === 0) return null;
    const result = (await client.query(
      `SELECT e.id AS entry_id,
              to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date,
              ROUND(e.duration_minutes * 60)::int AS duration_seconds,
              CASE WHEN e.distance > 0 THEN e.distance * 1000 END AS distance_m,
              e.avg_heart_rate
         FROM exercise_entries e
        WHERE e.route_id = $1 AND e.user_id = $2
        ORDER BY e.entry_date DESC, e.entry_time DESC NULLS LAST,
                 e.created_at DESC
        LIMIT 200`,
      [routeId, userId]
    )) as { rows: RouteRunRow[] };
    return result.rows.map((row) => ({
      entryId: row.entry_id,
      date: row.entry_date,
      durationSeconds: row.duration_seconds,
      distanceM: row.distance_m,
      paceSecPerKm:
        row.distance_m && row.distance_m > 0 && row.duration_seconds > 0
          ? Math.round(row.duration_seconds / (row.distance_m / 1000))
          : null,
      avgHeartRate: row.avg_heart_rate,
    }));
  } finally {
    client.release();
  }
}

export type SetEntryRouteResult = 'ok' | 'entry_not_found' | 'route_not_found';

/**
 * Links one of the person's exercise entries to one of their routes, or
 * clears the link when `routeId` is null. The route is looked up as the
 * person (the `routes` policy is owner-only), so another user's route, or any
 * route from a delegated context, is reported as not found.
 */
export async function setEntryRoute(
  userId: string,
  exerciseEntryId: string,
  routeId: string | null,
  authenticatedUserId?: string
): Promise<SetEntryRouteResult> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    if (routeId !== null) {
      const route = (await client.query(
        'SELECT 1 FROM routes WHERE id = $1 AND user_id = $2',
        [routeId, userId]
      )) as { rows: unknown[] };
      if (route.rows.length === 0) return 'route_not_found';
    }
    const result = (await client.query(
      'UPDATE exercise_entries SET route_id = $3 WHERE id = $1 AND user_id = $2',
      [exerciseEntryId, userId, routeId]
    )) as { rowCount: number | null };
    return (result.rowCount ?? 0) > 0 ? 'ok' : 'entry_not_found';
  } finally {
    client.release();
  }
}
