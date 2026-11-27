import { getClient } from '../db/poolManager.js';
import {
  HealthMetric,
  HealthMetricSamples,
  HealthMetricSamplesInitializer,
  VitalsEntries,
  VitalsEntriesInitializer,
  DailyHealthMetrics,
  DailyHealthMetricsInitializer,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import { isUniqueViolationOn } from '../utils/uniqueViolation.js';
import {
  pickDeviceTotalPerDay,
  type DeviceTotalCaloriesSourceRow,
} from '../utils/deviceTotalCalories.js';

/** Minimal client surface needed to run a parameterised statement within a caller-owned transaction. */
export interface HealthMetricSamplesDbClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Repository for continuous intraday health telemetry and daily summary metrics.
 */

// 1. Health Metric Samples (heart_rate / hrv / respiration / spo2 / stress /
// body_battery) — one row per (user, metric, entry_date, source_provider),
// holding the whole day's readings as a JSONB array. Replaces the four former
// per-sample tables (heart_rate_entries, hrv_entries, respiration_entries,
// spo2_entries); see PLAN/telemetry_redesign_phase_1_database.md.
//
// The upsert REPLACES the day's array (samples = EXCLUDED.samples), not merges
// it. Correct for Garmin, which returns the full day on every sync, and keeps
// re-syncs idempotent. A future provider delivering partial-day increments
// would need merge-on-conflict instead of this replace semantics.
export async function upsertHealthMetricSamples(
  userId: string,
  actingUserId: string,
  row: HealthMetricSamplesInitializer
): Promise<HealthMetricSamples> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `INSERT INTO health_metric_samples
        (user_id, metric, entry_date, source_provider, device_name, samples)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT uq_health_metric_samples
       DO UPDATE SET
         samples = EXCLUDED.samples,
         device_name = COALESCE(EXCLUDED.device_name, health_metric_samples.device_name),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        row.metric,
        row.entry_date,
        row.source_provider,
        row.device_name || null,
        JSON.stringify(row.samples),
      ]
    )) as { rows: HealthMetricSamples[] };
    return res.rows[0];
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getHealthMetricSamples(
  userId: string,
  actingUserId: string,
  metric: HealthMetric,
  startDate: string,
  endDate: string
): Promise<HealthMetricSamples[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM health_metric_samples
       WHERE user_id = $1 AND metric = $2 AND entry_date BETWEEN $3 AND $4
       ORDER BY entry_date ASC`,
      [userId, metric, startDate, endDate]
    )) as { rows: HealthMetricSamples[] };
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Transaction-scoped advisory lock keyed to one (user, metric, day, provider)
 * slot, released automatically on COMMIT or ROLLBACK.
 *
 * SELECT ... FOR UPDATE (below) only serializes against a row that already
 * exists. The first write for a given key has no row to lock — two concurrent
 * "first writes" would both see no existing row, both merge onto an empty
 * baseline, and the later INSERT's `samples = EXCLUDED.samples` would silently
 * discard the earlier write's samples instead of merging with them. Callers
 * must acquire this lock before the FOR UPDATE read so the second transaction
 * blocks until the first commits, and then sees the row the first one just
 * inserted.
 */
export async function acquireHealthMetricSampleLockWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  metric: HealthMetric,
  entryDate: string,
  sourceProvider: string
): Promise<void> {
  const key = `${userId}:${metric}:${entryDate}:${sourceProvider}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

/**
 * Row-locking read for the merge-write path: FOR UPDATE blocks a concurrent
 * writer targeting the same (user, metric, day, provider) row until this
 * transaction commits, so it always merges onto the latest data rather than a
 * stale snapshot. Callers in a `merge` write must call
 * acquireHealthMetricSampleLockWithClient first — this alone does not cover
 * the case where no row exists yet (see that function's docs).
 */
export async function getHealthMetricSampleRowForUpdateWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  metric: HealthMetric,
  entryDate: string,
  sourceProvider: string
): Promise<HealthMetricSamples | null> {
  const res = (await client.query(
    `SELECT * FROM health_metric_samples
     WHERE user_id = $1 AND metric = $2 AND entry_date = $3 AND source_provider = $4
     FOR UPDATE`,
    [userId, metric, entryDate, sourceProvider]
  )) as { rows: HealthMetricSamples[] };
  return res.rows[0] ?? null;
}

/** Same upsert as upsertHealthMetricSamples, but on a caller-supplied (and caller-committed) client. */
export async function upsertHealthMetricSamplesWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  row: HealthMetricSamplesInitializer
): Promise<HealthMetricSamples> {
  const res = (await client.query(
    `INSERT INTO health_metric_samples
      (user_id, metric, entry_date, source_provider, device_name, samples)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT uq_health_metric_samples
     DO UPDATE SET
       samples = EXCLUDED.samples,
       device_name = COALESCE(EXCLUDED.device_name, health_metric_samples.device_name),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      row.metric,
      row.entry_date,
      row.source_provider,
      row.device_name || null,
      JSON.stringify(row.samples),
    ]
  )) as { rows: HealthMetricSamples[] };
  return res.rows[0];
}

// 2. Vitals Entries

/**
 * A device glitch (systolic 310, diastolic 4) would hit the table's range
 * check and abort the rest of a provider's batch, so the impossible value is
 * dropped with a warning and the rest of the row is kept.
 */
function withoutImpossibleBloodPressure(
  entry: VitalsEntriesInitializer
): VitalsEntriesInitializer {
  const systolic = entry.systolic_mmhg;
  const diastolic = entry.diastolic_mmhg;
  const systolicBad =
    typeof systolic === 'number' && (systolic < 30 || systolic > 300);
  const diastolicBad =
    typeof diastolic === 'number' && (diastolic < 10 || diastolic > 200);
  if (!systolicBad && !diastolicBad) return entry;
  log(
    'warn',
    `vitals: dropped an impossible blood pressure value (${systolic}/${diastolic}) from ${entry.source_provider}.`
  );
  return {
    ...entry,
    systolic_mmhg: systolicBad ? null : systolic,
    diastolic_mmhg: diastolicBad ? null : diastolic,
  };
}

export async function bulkUpsertVitals(
  userId: string,
  actingUserId: string,
  entries: VitalsEntriesInitializer[]
): Promise<VitalsEntries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: VitalsEntries[] = [];

    for (const rawEntry of entries) {
      const entry = withoutImpossibleBloodPressure(rawEntry);
      const res = (await client.query(
        `INSERT INTO vitals_entries
          (user_id, entry_date, timestamp, systolic_mmhg, diastolic_mmhg, blood_glucose_mgdl, body_temperature_celsius, pulse_bpm, meal_context, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (user_id, source_provider, timestamp)
         DO UPDATE SET
           systolic_mmhg = COALESCE(EXCLUDED.systolic_mmhg, vitals_entries.systolic_mmhg),
           diastolic_mmhg = COALESCE(EXCLUDED.diastolic_mmhg, vitals_entries.diastolic_mmhg),
           blood_glucose_mgdl = COALESCE(EXCLUDED.blood_glucose_mgdl, vitals_entries.blood_glucose_mgdl),
           body_temperature_celsius = COALESCE(EXCLUDED.body_temperature_celsius, vitals_entries.body_temperature_celsius),
           pulse_bpm = COALESCE(EXCLUDED.pulse_bpm, vitals_entries.pulse_bpm),
           meal_context = COALESCE(EXCLUDED.meal_context, vitals_entries.meal_context),
           device_name = COALESCE(EXCLUDED.device_name, vitals_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, vitals_entries.external_id)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.systolic_mmhg ?? null,
          entry.diastolic_mmhg ?? null,
          entry.blood_glucose_mgdl ?? null,
          entry.body_temperature_celsius ?? null,
          entry.pulse_bpm === null || entry.pulse_bpm === undefined
            ? null
            : Math.round(entry.pulse_bpm),
          entry.meal_context || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: VitalsEntries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    client.release();
  }
}

/**
 * Real VO2 max readings (never carried forward from an earlier day) between two
 * days, one row per day and source.
 */
export async function getVo2MaxReadings(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ entry_date: string; source_provider: string; vo2_max: number }[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
              source_provider,
              vo2_max::float8 AS vo2_max
         FROM daily_health_metrics
        WHERE user_id = $1
          AND entry_date BETWEEN $2 AND $3
          AND vo2_max IS NOT NULL
        ORDER BY entry_date, source_provider`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getVitalsEntries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<VitalsEntries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM vitals_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: VitalsEntries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 2b. Blood pressure (manual entries live in vitals_entries next to synced ones)
export const MANUAL_VITALS_PROVIDER = 'manual';

export interface ManualBloodPressureInput {
  entry_date: string;
  timestamp: Date;
  systolic_mmhg: number;
  diastolic_mmhg: number;
  pulse_bpm?: number | null;
  arm?: string | null;
  body_position?: string | null;
  note?: string | null;
}

export type BloodPressureWriteResult =
  | { status: 'ok'; entry: VitalsEntries }
  | { status: 'not_found' }
  | { status: 'not_editable' }
  | { status: 'invalid'; reason: string }
  | { status: 'duplicate' };

/** A reading is a blood pressure row when it carries both values. */
export async function createManualBloodPressure(
  userId: string,
  actingUserId: string,
  input: ManualBloodPressureInput
): Promise<BloodPressureWriteResult> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `INSERT INTO vitals_entries
        (user_id, entry_date, timestamp, systolic_mmhg, diastolic_mmhg, pulse_bpm, arm, body_position, note, source_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        input.entry_date,
        input.timestamp,
        input.systolic_mmhg,
        input.diastolic_mmhg,
        input.pulse_bpm === null || input.pulse_bpm === undefined
          ? null
          : Math.round(input.pulse_bpm),
        input.arm ?? null,
        input.body_position ?? null,
        input.note ?? null,
        MANUAL_VITALS_PROVIDER,
      ]
    )) as { rows: VitalsEntries[] };
    return { status: 'ok', entry: res.rows[0] };
  } catch (error) {
    if (isUniqueViolationOn(error, 'uq_vitals_entry')) {
      return { status: 'duplicate' };
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface BloodPressureUpdateInput {
  entry_date?: string;
  timestamp?: Date;
  systolic_mmhg?: number;
  diastolic_mmhg?: number;
  pulse_bpm?: number | null;
  arm?: string | null;
  body_position?: string | null;
  note?: string | null;
}

/**
 * Edits a reading. A reading the person logged by hand can change in full. A
 * synced one (Garmin, Withings, Health Connect, ...) keeps its measured values
 * and time, since the next sync would write the original back; the context the
 * person adds (arm, position, pulse, note) is not part of what a sync sends,
 * so it stays.
 */
export async function updateBloodPressure(
  id: string,
  userId: string,
  actingUserId: string,
  changes: BloodPressureUpdateInput
): Promise<BloodPressureWriteResult> {
  const client = await getClient(actingUserId);
  try {
    const existing = (await client.query(
      `SELECT source_provider, systolic_mmhg, diastolic_mmhg FROM vitals_entries
       WHERE id = $1 AND user_id = $2 AND systolic_mmhg IS NOT NULL`,
      [id, userId]
    )) as {
      rows: {
        source_provider: string;
        systolic_mmhg: string | number;
        diastolic_mmhg: string | number | null;
      }[];
    };
    const stored = existing.rows[0];
    if (!stored) return { status: 'not_found' };
    if (
      stored.source_provider !== MANUAL_VITALS_PROVIDER &&
      (changes.systolic_mmhg !== undefined ||
        changes.diastolic_mmhg !== undefined ||
        changes.timestamp !== undefined ||
        changes.entry_date !== undefined)
    ) {
      return { status: 'not_editable' };
    }
    // The two values must still make sense together once the change is
    // applied, whichever of them the change leaves alone.
    const systolic = changes.systolic_mmhg ?? Number(stored.systolic_mmhg);
    const diastolic =
      changes.diastolic_mmhg ??
      (stored.diastolic_mmhg === null ? null : Number(stored.diastolic_mmhg));
    if (diastolic !== null && systolic <= diastolic) {
      return {
        status: 'invalid',
        reason: 'Systolic must be higher than diastolic',
      };
    }

    const columns: [string, unknown][] = [];
    if (changes.entry_date !== undefined)
      columns.push(['entry_date', changes.entry_date]);
    if (changes.timestamp !== undefined)
      columns.push(['timestamp', changes.timestamp]);
    if (changes.systolic_mmhg !== undefined)
      columns.push(['systolic_mmhg', changes.systolic_mmhg]);
    if (changes.diastolic_mmhg !== undefined)
      columns.push(['diastolic_mmhg', changes.diastolic_mmhg]);
    if (changes.pulse_bpm !== undefined)
      columns.push([
        'pulse_bpm',
        changes.pulse_bpm === null ? null : Math.round(changes.pulse_bpm),
      ]);
    if (changes.arm !== undefined) columns.push(['arm', changes.arm]);
    if (changes.body_position !== undefined)
      columns.push(['body_position', changes.body_position]);
    if (changes.note !== undefined) columns.push(['note', changes.note]);

    const sets = columns.map(([name], i) => `${name} = $${i + 3}`);
    sets.push('updated_at = NOW()');
    const res = (await client.query(
      `UPDATE vitals_entries SET ${sets.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, ...columns.map(([, value]) => value)]
    )) as { rows: VitalsEntries[] };
    return { status: 'ok', entry: res.rows[0] };
  } catch (error) {
    if (isUniqueViolationOn(error, 'uq_vitals_entry')) {
      return { status: 'duplicate' };
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Deletes one blood pressure reading, manual or synced (a sync can bring a synced one back). */
export async function deleteBloodPressure(
  id: string,
  userId: string,
  actingUserId: string
): Promise<boolean> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `DELETE FROM vitals_entries
       WHERE id = $1 AND user_id = $2 AND systolic_mmhg IS NOT NULL`,
      [id, userId]
    )) as { rowCount: number | null };
    return (res.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * The stored instant of this source's blood pressure reading closest to `at`
 * within `windowSeconds`, if any. A device that reports one cuff reading
 * through two APIs with slightly different times is then written once.
 */
export async function findNearbyBloodPressureTimestamp(
  userId: string,
  actingUserId: string,
  sourceProvider: string,
  at: Date,
  windowSeconds: number
): Promise<Date | null> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT timestamp FROM vitals_entries
       WHERE user_id = $1 AND source_provider = $2
         AND (systolic_mmhg IS NOT NULL OR diastolic_mmhg IS NOT NULL)
         AND timestamp BETWEEN $3::timestamptz - make_interval(secs => $4)
                           AND $3::timestamptz + make_interval(secs => $4)
       ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $3::timestamptz))) ASC
       LIMIT 1`,
      [userId, sourceProvider, at, windowSeconds]
    )) as { rows: { timestamp: Date }[] };
    const found = res.rows[0];
    return found ? new Date(found.timestamp) : null;
  } finally {
    client.release();
  }
}

// 3. Daily Health Metrics (Wearable daily summaries & scores)
export async function upsertDailyHealthMetrics(
  userId: string,
  actingUserId: string,
  metric: DailyHealthMetricsInitializer
): Promise<DailyHealthMetrics> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `INSERT INTO daily_health_metrics 
        (user_id, entry_date, source_provider, device_name, total_steps, step_goal, total_distance_meters,
         floors_ascended, floors_descended, active_calories, bmr_calories, total_calories, total_calories_captured_at, highly_active_seconds,
         active_seconds, sedentary_seconds, moderate_intensity_minutes, vigorous_intensity_minutes, exercise_minutes,
         stand_hours, resting_heart_rate, heart_rate_recovery_1min, vo2_max, fitness_age, lactate_threshold_bpm,
         lactate_threshold_speed_mps, walking_asymmetry_percentage, hill_score, race_prediction_5k_seconds,
         race_prediction_10k_seconds, race_prediction_half_marathon_seconds, race_prediction_marathon_seconds,
         recovery_time_hours, training_readiness_score, endurance_score, weekly_training_load, acute_training_load,
         chronic_training_load, acwr_ratio, avg_stress_level, max_stress_level, body_battery_charged, body_battery_drained, body_battery_highest, body_battery_lowest, total_mindful_minutes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, NOW())
       ON CONFLICT (user_id, entry_date, source_provider)
       DO UPDATE SET
         device_name = COALESCE(EXCLUDED.device_name, daily_health_metrics.device_name),
         total_steps = COALESCE(EXCLUDED.total_steps, daily_health_metrics.total_steps),
         step_goal = COALESCE(EXCLUDED.step_goal, daily_health_metrics.step_goal),
         total_distance_meters = COALESCE(EXCLUDED.total_distance_meters, daily_health_metrics.total_distance_meters),
         floors_ascended = COALESCE(EXCLUDED.floors_ascended, daily_health_metrics.floors_ascended),
         floors_descended = COALESCE(EXCLUDED.floors_descended, daily_health_metrics.floors_descended),
         active_calories = COALESCE(EXCLUDED.active_calories, daily_health_metrics.active_calories),
         bmr_calories = COALESCE(EXCLUDED.bmr_calories, daily_health_metrics.bmr_calories),
         -- Daily aggregate syncs can finish out of order. Advance the calorie
         -- snapshot and its capture time together, never independently. A NULL
         -- incoming stamp only fills a NULL slot: the comparison is NULL, so a
         -- stamped total is never displaced by an unordered legacy write.
         total_calories = CASE
           WHEN EXCLUDED.total_calories IS NOT NULL
             AND (
               daily_health_metrics.total_calories_captured_at IS NULL
               OR EXCLUDED.total_calories_captured_at > daily_health_metrics.total_calories_captured_at
             )
           THEN EXCLUDED.total_calories
           ELSE daily_health_metrics.total_calories
         END,
         total_calories_captured_at = CASE
           WHEN EXCLUDED.total_calories IS NOT NULL
             AND (
               daily_health_metrics.total_calories_captured_at IS NULL
               OR EXCLUDED.total_calories_captured_at > daily_health_metrics.total_calories_captured_at
             )
           THEN EXCLUDED.total_calories_captured_at
           ELSE daily_health_metrics.total_calories_captured_at
         END,
         highly_active_seconds = COALESCE(EXCLUDED.highly_active_seconds, daily_health_metrics.highly_active_seconds),
         active_seconds = COALESCE(EXCLUDED.active_seconds, daily_health_metrics.active_seconds),
         sedentary_seconds = COALESCE(EXCLUDED.sedentary_seconds, daily_health_metrics.sedentary_seconds),
         moderate_intensity_minutes = COALESCE(EXCLUDED.moderate_intensity_minutes, daily_health_metrics.moderate_intensity_minutes),
         vigorous_intensity_minutes = COALESCE(EXCLUDED.vigorous_intensity_minutes, daily_health_metrics.vigorous_intensity_minutes),
         exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, daily_health_metrics.exercise_minutes),
         stand_hours = COALESCE(EXCLUDED.stand_hours, daily_health_metrics.stand_hours),
         resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, daily_health_metrics.resting_heart_rate),
         heart_rate_recovery_1min = COALESCE(EXCLUDED.heart_rate_recovery_1min, daily_health_metrics.heart_rate_recovery_1min),
         vo2_max = COALESCE(EXCLUDED.vo2_max, daily_health_metrics.vo2_max),
         fitness_age = COALESCE(EXCLUDED.fitness_age, daily_health_metrics.fitness_age),
         lactate_threshold_bpm = COALESCE(EXCLUDED.lactate_threshold_bpm, daily_health_metrics.lactate_threshold_bpm),
         lactate_threshold_speed_mps = COALESCE(EXCLUDED.lactate_threshold_speed_mps, daily_health_metrics.lactate_threshold_speed_mps),
         walking_asymmetry_percentage = COALESCE(EXCLUDED.walking_asymmetry_percentage, daily_health_metrics.walking_asymmetry_percentage),
         hill_score = COALESCE(EXCLUDED.hill_score, daily_health_metrics.hill_score),
         race_prediction_5k_seconds = COALESCE(EXCLUDED.race_prediction_5k_seconds, daily_health_metrics.race_prediction_5k_seconds),
         race_prediction_10k_seconds = COALESCE(EXCLUDED.race_prediction_10k_seconds, daily_health_metrics.race_prediction_10k_seconds),
         race_prediction_half_marathon_seconds = COALESCE(EXCLUDED.race_prediction_half_marathon_seconds, daily_health_metrics.race_prediction_half_marathon_seconds),
         race_prediction_marathon_seconds = COALESCE(EXCLUDED.race_prediction_marathon_seconds, daily_health_metrics.race_prediction_marathon_seconds),
         recovery_time_hours = COALESCE(EXCLUDED.recovery_time_hours, daily_health_metrics.recovery_time_hours),
         training_readiness_score = COALESCE(EXCLUDED.training_readiness_score, daily_health_metrics.training_readiness_score),
         endurance_score = COALESCE(EXCLUDED.endurance_score, daily_health_metrics.endurance_score),
         weekly_training_load = COALESCE(EXCLUDED.weekly_training_load, daily_health_metrics.weekly_training_load),
         acute_training_load = COALESCE(EXCLUDED.acute_training_load, daily_health_metrics.acute_training_load),
         chronic_training_load = COALESCE(EXCLUDED.chronic_training_load, daily_health_metrics.chronic_training_load),
         acwr_ratio = COALESCE(EXCLUDED.acwr_ratio, daily_health_metrics.acwr_ratio),
         avg_stress_level = COALESCE(EXCLUDED.avg_stress_level, daily_health_metrics.avg_stress_level),
         max_stress_level = COALESCE(EXCLUDED.max_stress_level, daily_health_metrics.max_stress_level),
         body_battery_charged = COALESCE(EXCLUDED.body_battery_charged, daily_health_metrics.body_battery_charged),
         body_battery_drained = COALESCE(EXCLUDED.body_battery_drained, daily_health_metrics.body_battery_drained),
         body_battery_highest = COALESCE(EXCLUDED.body_battery_highest, daily_health_metrics.body_battery_highest),
         body_battery_lowest = COALESCE(EXCLUDED.body_battery_lowest, daily_health_metrics.body_battery_lowest),
         total_mindful_minutes = COALESCE(EXCLUDED.total_mindful_minutes, daily_health_metrics.total_mindful_minutes),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        metric.entry_date,
        metric.source_provider,
        metric.device_name || null,
        metric.total_steps ?? null,
        metric.step_goal ?? null,
        metric.total_distance_meters ?? null,
        metric.floors_ascended ?? null,
        metric.floors_descended ?? null,
        metric.active_calories ?? null,
        metric.bmr_calories ?? null,
        metric.total_calories ?? null,
        metric.total_calories_captured_at ?? null,
        metric.highly_active_seconds ?? null,
        metric.active_seconds ?? null,
        metric.sedentary_seconds ?? null,
        metric.moderate_intensity_minutes ?? null,
        metric.vigorous_intensity_minutes ?? null,
        metric.exercise_minutes ?? null,
        metric.stand_hours ?? null,
        metric.resting_heart_rate ?? null,
        metric.heart_rate_recovery_1min ?? null,
        metric.vo2_max ?? null,
        metric.fitness_age ?? null,
        metric.lactate_threshold_bpm ?? null,
        metric.lactate_threshold_speed_mps ?? null,
        metric.walking_asymmetry_percentage ?? null,
        metric.hill_score ?? null,
        metric.race_prediction_5k_seconds ?? null,
        metric.race_prediction_10k_seconds ?? null,
        metric.race_prediction_half_marathon_seconds ?? null,
        metric.race_prediction_marathon_seconds ?? null,
        metric.recovery_time_hours ?? null,
        metric.training_readiness_score ?? null,
        metric.endurance_score ?? null,
        metric.weekly_training_load ?? null,
        metric.acute_training_load ?? null,
        metric.chronic_training_load ?? null,
        metric.acwr_ratio ?? null,
        metric.avg_stress_level ?? null,
        metric.max_stress_level ?? null,
        metric.body_battery_charged ?? null,
        metric.body_battery_drained ?? null,
        metric.body_battery_highest ?? null,
        metric.body_battery_lowest ?? null,
        metric.total_mindful_minutes ?? null,
      ]
    )) as { rows: DailyHealthMetrics[] };
    return res.rows[0];
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

/**
 * Retrieves daily wearable health metrics for a date range, carrying forward
 * the most recent non-null values for episodic metrics (e.g. VO2 max, fitness
 * age, lactate threshold, hill score, endurance score, race predictions) from
 * earlier entries with the same user and source provider when dates lack fresh readings.
 *
 * @param userId - Target user whose daily health metrics are being requested.
 * @param actingUserId - Authenticated user making the request (for RLS check).
 * @param startDate - Range start date string (YYYY-MM-DD).
 * @param endDate - Range end date string (YYYY-MM-DD).
 * @returns Array of daily health metric records ordered by entry_date ascending.
 */
export async function getDailyHealthMetrics(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<DailyHealthMetrics[]> {
  const client = await getClient(userId, actingUserId);
  try {
    const res = (await client.query(
      `SELECT 
        dhm.id,
        dhm.user_id,
        dhm.entry_date,
        dhm.source_provider,
        dhm.device_name,
        dhm.total_steps,
        dhm.step_goal,
        dhm.total_distance_meters,
        dhm.floors_ascended,
        dhm.floors_descended,
        dhm.active_calories,
        dhm.bmr_calories,
        dhm.total_calories,
        dhm.total_calories_captured_at,
        dhm.highly_active_seconds,
        dhm.active_seconds,
        dhm.sedentary_seconds,
        dhm.moderate_intensity_minutes,
        dhm.vigorous_intensity_minutes,
        dhm.exercise_minutes,
        dhm.stand_hours,
        dhm.resting_heart_rate,
        dhm.heart_rate_recovery_1min,
        COALESCE(
          dhm.vo2_max,
          (SELECT vo2_max FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.vo2_max IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS vo2_max,
        COALESCE(
          dhm.fitness_age,
          (SELECT fitness_age FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.fitness_age IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS fitness_age,
        COALESCE(
          dhm.lactate_threshold_bpm,
          (SELECT lactate_threshold_bpm FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.lactate_threshold_bpm IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS lactate_threshold_bpm,
        COALESCE(
          dhm.lactate_threshold_speed_mps,
          (SELECT lactate_threshold_speed_mps FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.lactate_threshold_speed_mps IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS lactate_threshold_speed_mps,
        COALESCE(
          dhm.walking_asymmetry_percentage,
          (SELECT walking_asymmetry_percentage FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.walking_asymmetry_percentage IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS walking_asymmetry_percentage,
        COALESCE(
          dhm.hill_score,
          (SELECT hill_score FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.hill_score IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS hill_score,
        COALESCE(
          dhm.race_prediction_5k_seconds,
          (SELECT race_prediction_5k_seconds FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.race_prediction_5k_seconds IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS race_prediction_5k_seconds,
        COALESCE(
          dhm.race_prediction_10k_seconds,
          (SELECT race_prediction_10k_seconds FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.race_prediction_10k_seconds IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS race_prediction_10k_seconds,
        COALESCE(
          dhm.race_prediction_half_marathon_seconds,
          (SELECT race_prediction_half_marathon_seconds FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.race_prediction_half_marathon_seconds IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS race_prediction_half_marathon_seconds,
        COALESCE(
          dhm.race_prediction_marathon_seconds,
          (SELECT race_prediction_marathon_seconds FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.race_prediction_marathon_seconds IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS race_prediction_marathon_seconds,
        dhm.recovery_time_hours,
        dhm.training_readiness_score,
        COALESCE(
          dhm.endurance_score,
          (SELECT endurance_score FROM daily_health_metrics d2
           WHERE d2.user_id = dhm.user_id
             AND d2.source_provider = dhm.source_provider
             AND d2.entry_date < dhm.entry_date
             AND d2.endurance_score IS NOT NULL
           ORDER BY d2.entry_date DESC LIMIT 1)
        ) AS endurance_score,
        dhm.weekly_training_load,
        dhm.acute_training_load,
        dhm.chronic_training_load,
        dhm.acwr_ratio,
        dhm.avg_stress_level,
        dhm.max_stress_level,
        dhm.body_battery_charged,
        dhm.body_battery_drained,
        dhm.body_battery_highest,
        dhm.body_battery_lowest,
        dhm.created_at,
        dhm.updated_at
       FROM daily_health_metrics dhm
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    )) as { rows: DailyHealthMetrics[] };
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Returns one device total-energy figure per requested day, from whichever source
 * `pickDeviceTotalPerDay` chooses (Health Connect, Garmin, Polar).
 * Each value is already that source's own full total, so sources are never
 * combined.
 */
export async function getDeviceTotalCaloriesByDateRange(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<DeviceTotalCaloriesSourceRow[]> {
  const client = await getClient(actingUserId);
  try {
    const res = await client.query(
      `SELECT entry_date::text,
              source_provider,
              total_calories::float8,
              COALESCE(total_calories_captured_at, updated_at, created_at) AS captured_at
       FROM daily_health_metrics
       WHERE user_id = $1
         AND total_calories IS NOT NULL
         AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return pickDeviceTotalPerDay(res.rows as DeviceTotalCaloriesSourceRow[]);
  } finally {
    client.release();
  }
}
