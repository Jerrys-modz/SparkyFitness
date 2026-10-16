import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  DEFAULT_COMPONENT_LIFE,
  computeComponentWear,
  type AssignBikeResponse,
  type BikeComponentResponse,
  type BikeComponentType,
  type BikeDetailResponse,
  type BikeResponse,
  type BikeStatus,
  type CreateBikeBody,
  type CreateBikeComponentBody,
  type ReplaceBikeComponentBody,
  type ReplaceBikeComponentResponse,
  type UpdateBikeBody,
  type UpdateBikeComponentBody,
} from '@workspace/shared';

// Distance on exercise_entries is stored in kilometres. A ride's time is its
// moving time, falling back to the logged duration. Dates are formatted in SQL
// so they stay calendar-day strings instead of passing through a JS Date.
const RIDE_SECONDS =
  'COALESCE(ee.moving_time_seconds, ee.duration_minutes * 60)';

const BIKE_SELECT = `
  SELECT
    b.id, b.user_id, b.name, b.brand, b.model,
    to_char(b.purchase_date, 'YYYY-MM-DD') AS purchase_date,
    b.purchase_price, b.starting_distance_km, b.starting_moving_time_seconds,
    b.status, b.is_default, b.retired_at, b.created_at, b.updated_at,
    COALESCE(SUM(ee.distance), 0) AS logged_distance_km,
    COALESCE(SUM(${RIDE_SECONDS}), 0) AS logged_moving_time_seconds,
    COUNT(ee.id) AS ride_count,
    to_char(MAX(ee.entry_date), 'YYYY-MM-DD') AS last_used_date
  FROM bikes b
  LEFT JOIN exercise_entries ee ON ee.bike_id = b.id`;

const BIKE_GROUP_BY = 'GROUP BY b.id';

// A component wears with the rides on its bike from the day it was installed
// up to (not including) the day it was retired, so a same-day replacement
// credits that day's rides to the new part.
const COMPONENT_SELECT = `
  SELECT
    c.id, c.user_id, c.bike_id, c.component_type, c.name,
    to_char(c.installed_on, 'YYYY-MM-DD') AS installed_on,
    c.expected_life_km, c.expected_life_hours, c.status,
    to_char(c.retired_on, 'YYYY-MM-DD') AS retired_on,
    c.notes, c.created_at, c.updated_at,
    COALESCE(SUM(ee.distance), 0) AS distance_km,
    COALESCE(SUM(${RIDE_SECONDS}), 0) / 3600.0 AS hours,
    COUNT(ee.id) AS ride_count
  FROM bike_components c
  LEFT JOIN exercise_entries ee
    ON ee.bike_id = c.bike_id
   AND ee.entry_date >= c.installed_on
   AND (c.retired_on IS NULL OR ee.entry_date < c.retired_on)`;

const COMPONENT_GROUP_BY = 'GROUP BY c.id';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapRowToComponent(
  row: Record<string, unknown>
): BikeComponentResponse {
  const distanceKm = Number(row.distance_km);
  const hours = Number(row.hours);
  const expectedLifeKm = toNumberOrNull(row.expected_life_km);
  const expectedLifeHours = toNumberOrNull(row.expected_life_hours);
  const { wearPercent, state } = computeComponentWear({
    distanceKm,
    hours,
    expectedLifeKm,
    expectedLifeHours,
  });
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    bike_id: String(row.bike_id),
    component_type: row.component_type as BikeComponentType,
    name: String(row.name),
    installed_on: String(row.installed_on),
    expected_life_km: expectedLifeKm,
    expected_life_hours: expectedLifeHours,
    status: row.status as BikeComponentResponse['status'],
    retired_on: row.retired_on ? String(row.retired_on) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    distance_km: distanceKm,
    hours,
    ride_count: Number(row.ride_count),
    wear_percent: wearPercent,
    wear_state: state,
  };
}

function mapRowToBike(
  row: Record<string, unknown>,
  components: BikeComponentResponse[] = []
): BikeResponse {
  const loggedDistance = Number(row.logged_distance_km);
  const loggedTime = Number(row.logged_moving_time_seconds);
  const active = components.filter((c) => c.status === 'active');
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    brand: row.brand ? String(row.brand) : null,
    model: row.model ? String(row.model) : null,
    purchase_date: row.purchase_date ? String(row.purchase_date) : null,
    purchase_price: toNumberOrNull(row.purchase_price),
    starting_distance_km: Number(row.starting_distance_km),
    starting_moving_time_seconds: Number(row.starting_moving_time_seconds),
    status: row.status as BikeStatus,
    is_default: Boolean(row.is_default),
    retired_at: row.retired_at ? toIso(row.retired_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    logged_distance_km: loggedDistance,
    total_distance_km: Number(row.starting_distance_km) + loggedDistance,
    logged_moving_time_seconds: loggedTime,
    total_moving_time_seconds:
      Number(row.starting_moving_time_seconds) + loggedTime,
    ride_count: Number(row.ride_count),
    last_used_date: row.last_used_date ? String(row.last_used_date) : null,
    due_now_component_count: active.filter((c) => c.wear_state === 'due_now')
      .length,
    due_soon_component_count: active.filter((c) => c.wear_state === 'due_soon')
      .length,
  };
}

async function fetchActiveComponentsByBike(
  client: PoolClient,
  userId: string
): Promise<Map<string, BikeComponentResponse[]>> {
  const result = await client.query(
    `${COMPONENT_SELECT}
     WHERE c.user_id = $1 AND c.status = 'active'
     ${COMPONENT_GROUP_BY}`,
    [userId]
  );
  const byBike = new Map<string, BikeComponentResponse[]>();
  for (const row of result.rows) {
    const component = mapRowToComponent(row);
    byBike.set(component.bike_id, [
      ...(byBike.get(component.bike_id) ?? []),
      component,
    ]);
  }
  return byBike;
}

async function fetchComponentsForBike(
  client: PoolClient,
  userId: string,
  bikeId: string
): Promise<BikeComponentResponse[]> {
  const result = await client.query(
    `${COMPONENT_SELECT}
     WHERE c.user_id = $1 AND c.bike_id = $2
     ${COMPONENT_GROUP_BY}
     ORDER BY (c.status = 'active') DESC, c.component_type, c.installed_on DESC,
       c.created_at DESC`,
    [userId, bikeId]
  );
  return result.rows.map(mapRowToComponent);
}

async function fetchBikeWithClient(
  client: PoolClient,
  userId: string,
  bikeId: string
): Promise<BikeDetailResponse | null> {
  const result = await client.query(
    `${BIKE_SELECT} WHERE b.id = $1 AND b.user_id = $2 ${BIKE_GROUP_BY}`,
    [bikeId, userId]
  );
  if (!result.rows[0]) return null;
  const components = await fetchComponentsForBike(client, userId, bikeId);
  return { ...mapRowToBike(result.rows[0], components), components };
}

async function fetchComponentWithClient(
  client: PoolClient,
  userId: string,
  bikeId: string,
  componentId: string
): Promise<BikeComponentResponse | null> {
  const result = await client.query(
    `${COMPONENT_SELECT}
     WHERE c.id = $1 AND c.bike_id = $2 AND c.user_id = $3
     ${COMPONENT_GROUP_BY}`,
    [componentId, bikeId, userId]
  );
  return result.rows[0] ? mapRowToComponent(result.rows[0]) : null;
}

async function clearDefaultWithClient(
  client: PoolClient,
  userId: string,
  exceptBikeId: string | null
): Promise<void> {
  await client.query(
    `UPDATE bikes SET is_default = FALSE, updated_at = NOW()
     WHERE user_id = $1 AND is_default AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, exceptBikeId]
  );
}

async function lockBikesWithClient(
  client: PoolClient,
  userId: string
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `bikes:${userId}`,
  ]);
}

export async function getBikes(
  userId: string,
  authenticatedUserId?: string,
  status?: BikeStatus
): Promise<BikeResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `${BIKE_SELECT}
       WHERE b.user_id = $1 AND ($2::text IS NULL OR b.status = $2)
       ${BIKE_GROUP_BY}
       ORDER BY (b.status = 'active') DESC, b.is_default DESC, b.created_at DESC`,
      [userId, status ?? null]
    );
    const componentsByBike = await fetchActiveComponentsByBike(client, userId);
    return result.rows.map((row: Record<string, unknown>) =>
      mapRowToBike(row, componentsByBike.get(String(row.id)))
    );
  } finally {
    client.release();
  }
}

export async function getBikeById(
  userId: string,
  bikeId: string,
  authenticatedUserId?: string
): Promise<BikeDetailResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    return await fetchBikeWithClient(client, userId, bikeId);
  } finally {
    client.release();
  }
}

export async function createBike(
  userId: string,
  data: CreateBikeBody,
  authenticatedUserId?: string
): Promise<BikeDetailResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    if (data.is_default) {
      await lockBikesWithClient(client, userId);
      await clearDefaultWithClient(client, userId, null);
    }
    const inserted = await client.query(
      `INSERT INTO bikes (
        user_id, name, brand, model, purchase_date, purchase_price,
        starting_distance_km, starting_moving_time_seconds, is_default,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        userId,
        data.name,
        data.brand ?? null,
        data.model ?? null,
        data.purchase_date ?? null,
        data.purchase_price ?? null,
        data.starting_distance_km ?? 0,
        data.starting_moving_time_seconds ?? 0,
        data.is_default ?? false,
        authenticatedUserId ?? userId,
      ]
    );
    const bike = await fetchBikeWithClient(
      client,
      userId,
      String(inserted.rows[0].id)
    );
    await client.query('COMMIT');
    return bike as BikeDetailResponse;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateBike(
  userId: string,
  bikeId: string,
  data: UpdateBikeBody,
  authenticatedUserId?: string
): Promise<BikeDetailResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Read the current default only after any other update has committed.
    await lockBikesWithClient(client, userId);
    const current = await fetchBikeWithClient(client, userId, bikeId);
    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    const status = data.status ?? current.status;
    // A retired bike can't be the default for new rides.
    const isDefault =
      status === 'retired' ? false : (data.is_default ?? current.is_default);
    if (isDefault) {
      await clearDefaultWithClient(client, userId, bikeId);
    }
    const retiredAt =
      status === 'retired'
        ? (current.retired_at ?? new Date().toISOString())
        : null;
    const pick = <T>(value: T | undefined, fallback: T): T =>
      value === undefined ? fallback : value;

    await client.query(
      `UPDATE bikes SET
        name = $3, brand = $4, model = $5,
        purchase_date = $6, purchase_price = $7,
        starting_distance_km = $8, starting_moving_time_seconds = $9,
        status = $10, is_default = $11, retired_at = $12,
        updated_by_user_id = $13, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [
        bikeId,
        userId,
        pick(data.name, current.name),
        pick(data.brand, current.brand),
        pick(data.model, current.model),
        pick(data.purchase_date, current.purchase_date),
        pick(data.purchase_price, current.purchase_price),
        pick(data.starting_distance_km, current.starting_distance_km),
        pick(
          data.starting_moving_time_seconds,
          current.starting_moving_time_seconds
        ),
        status,
        isDefault,
        retiredAt,
        authenticatedUserId ?? userId,
      ]
    );
    const updated = await fetchBikeWithClient(client, userId, bikeId);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteBike(
  userId: string,
  bikeId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    // exercise_entries.bike_id is ON DELETE SET NULL, so diary entries
    // survive; the bike's components are removed with it (ON DELETE CASCADE).
    const result = await client.query(
      'DELETE FROM bikes WHERE id = $1 AND user_id = $2',
      [bikeId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Resolves the expected life for a new component: whatever the caller set,
 * else the type's default kilometres. Setting only hours does not add a
 * distance limit.
 */
function resolveExpectedLife(
  type: BikeComponentType,
  km: number | null | undefined,
  hours: number | null | undefined
): { km: number | null; hours: number | null } {
  if ((km ?? null) === null && (hours ?? null) === null) {
    const fallback = DEFAULT_COMPONENT_LIFE[type];
    return { km: fallback.km, hours: fallback.hours };
  }
  return { km: km ?? null, hours: hours ?? null };
}

export async function createBikeComponent(
  userId: string,
  bikeId: string,
  data: CreateBikeComponentBody,
  authenticatedUserId?: string
): Promise<BikeComponentResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const bike = await client.query(
      'SELECT 1 FROM bikes WHERE id = $1 AND user_id = $2',
      [bikeId, userId]
    );
    if (bike.rowCount === 0) return null;
    const life = resolveExpectedLife(
      data.component_type,
      data.expected_life_km,
      data.expected_life_hours
    );
    const inserted = await client.query(
      `INSERT INTO bike_components (
        user_id, bike_id, component_type, name, installed_on,
        expected_life_km, expected_life_hours, notes, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        userId,
        bikeId,
        data.component_type,
        data.name,
        data.installed_on,
        life.km,
        life.hours,
        data.notes ?? null,
        authenticatedUserId ?? userId,
      ]
    );
    return await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      String(inserted.rows[0].id)
    );
  } finally {
    client.release();
  }
}

export async function updateBikeComponent(
  userId: string,
  bikeId: string,
  componentId: string,
  data: UpdateBikeComponentBody,
  authenticatedUserId?: string
): Promise<BikeComponentResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const current = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      componentId
    );
    if (!current) return null;
    const pick = <T>(value: T | undefined, fallback: T): T =>
      value === undefined ? fallback : value;
    let km = pick(data.expected_life_km, current.expected_life_km);
    let hours = pick(data.expected_life_hours, current.expected_life_hours);
    // Clearing the last limit falls back to the type default rather than
    // leaving a component that can never wear out.
    if (km === null && hours === null) {
      ({ km, hours } = resolveExpectedLife(current.component_type, null, null));
    }
    await client.query(
      `UPDATE bike_components SET
        name = $4, installed_on = $5, expected_life_km = $6,
        expected_life_hours = $7, notes = $8,
        updated_by_user_id = $9, updated_at = NOW()
       WHERE id = $1 AND bike_id = $2 AND user_id = $3`,
      [
        componentId,
        bikeId,
        userId,
        pick(data.name, current.name),
        pick(data.installed_on, current.installed_on),
        km,
        hours,
        pick(data.notes, current.notes),
        authenticatedUserId ?? userId,
      ]
    );
    return await fetchComponentWithClient(client, userId, bikeId, componentId);
  } finally {
    client.release();
  }
}

export type RetireComponentResult =
  | { kind: 'not_found' }
  | { kind: 'already_retired' }
  | { kind: 'before_install' }
  | { kind: 'retired'; component: BikeComponentResponse };

/**
 * Retires an active component, keeping the row as history. `retiredOn` must
 * not precede the install day (the table enforces it too).
 */
export async function retireBikeComponent(
  userId: string,
  bikeId: string,
  componentId: string,
  retiredOn: string,
  authenticatedUserId?: string
): Promise<RetireComponentResult> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const current = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      componentId
    );
    if (!current) return { kind: 'not_found' };
    if (current.status === 'retired') return { kind: 'already_retired' };
    if (retiredOn < current.installed_on) return { kind: 'before_install' };
    await client.query(
      `UPDATE bike_components SET
        status = 'retired', retired_on = $4,
        updated_by_user_id = $5, updated_at = NOW()
       WHERE id = $1 AND bike_id = $2 AND user_id = $3`,
      [componentId, bikeId, userId, retiredOn, authenticatedUserId ?? userId]
    );
    const component = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      componentId
    );
    return { kind: 'retired', component: component as BikeComponentResponse };
  } finally {
    client.release();
  }
}

export type ReplaceComponentResult =
  | { kind: 'not_found' }
  | { kind: 'already_retired' }
  | { kind: 'before_install' }
  | { kind: 'replaced'; result: ReplaceBikeComponentResponse };

/**
 * Retires a component and installs a new one of the same type in one
 * transaction. The new part starts counting on `replacedOn`, so rides on that
 * day wear the new part, not the old one.
 */
export async function replaceBikeComponent(
  userId: string,
  bikeId: string,
  componentId: string,
  replacedOn: string,
  data: ReplaceBikeComponentBody,
  authenticatedUserId?: string
): Promise<ReplaceComponentResult> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Serialize concurrent replacements of the same part.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `bike_component:${componentId}`,
    ]);
    const current = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      componentId
    );
    if (!current) {
      await client.query('ROLLBACK');
      return { kind: 'not_found' };
    }
    if (current.status === 'retired') {
      await client.query('ROLLBACK');
      return { kind: 'already_retired' };
    }
    if (replacedOn < current.installed_on) {
      await client.query('ROLLBACK');
      return { kind: 'before_install' };
    }
    const actor = authenticatedUserId ?? userId;
    await client.query(
      `UPDATE bike_components SET
        status = 'retired', retired_on = $4,
        updated_by_user_id = $5, updated_at = NOW()
       WHERE id = $1 AND bike_id = $2 AND user_id = $3`,
      [componentId, bikeId, userId, replacedOn, actor]
    );
    const km =
      data.expected_life_km === undefined
        ? current.expected_life_km
        : data.expected_life_km;
    const hours =
      data.expected_life_hours === undefined
        ? current.expected_life_hours
        : data.expected_life_hours;
    const life = resolveExpectedLife(current.component_type, km, hours);
    const inserted = await client.query(
      `INSERT INTO bike_components (
        user_id, bike_id, component_type, name, installed_on,
        expected_life_km, expected_life_hours, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        userId,
        bikeId,
        current.component_type,
        data.name ?? current.name,
        replacedOn,
        life.km,
        life.hours,
        actor,
      ]
    );
    const retired = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      componentId
    );
    const installed = await fetchComponentWithClient(
      client,
      userId,
      bikeId,
      String(inserted.rows[0].id)
    );
    await client.query('COMMIT');
    return {
      kind: 'replaced',
      result: {
        retired: retired as BikeComponentResponse,
        installed: installed as BikeComponentResponse,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteBikeComponent(
  userId: string,
  bikeId: string,
  componentId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM bike_components WHERE id = $1 AND bike_id = $2 AND user_id = $3',
      [componentId, bikeId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Links an exercise entry to a bike, or clears the link with `null`.
 * Returns null when the entry (or the bike) isn't visible to this user.
 */
export async function assignBikeToExerciseEntry(
  userId: string,
  exerciseEntryId: string,
  bikeId: string | null,
  authenticatedUserId?: string
): Promise<AssignBikeResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    if (bikeId) {
      const bike = await client.query(
        'SELECT 1 FROM bikes WHERE id = $1 AND user_id = $2',
        [bikeId, userId]
      );
      if (bike.rowCount === 0) return null;
    }
    const result = await client.query(
      `UPDATE exercise_entries SET bike_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, bike_id`,
      [exerciseEntryId, userId, bikeId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      exercise_entry_id: String(row.id),
      bike_id: row.bike_id ? String(row.bike_id) : null,
    };
  } finally {
    client.release();
  }
}
