import {
  COACH_CHECKIN_DEFAULT_HOUR,
  COACH_TRIGGER_TYPES,
  type CoachCheckinSettings,
  type CoachMessage,
  type CoachTrigger,
  type CoachTriggerType,
  type UpdateCoachCheckinSettingsBody,
} from '@workspace/shared';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { LOGGED_WORKOUT_SQL } from './coachRepository.js';
import { MAIN_SLEEP_ORDER_SQL } from './sleepRepository.js';

// Coach check-ins (#2013): the settings, the facts the trigger rules read and
// the messages a check-in writes.

const MESSAGE_COLUMNS = `id, coach_id, trigger_type, entry_date::text AS entry_date,
  facts, ai_text, created_at, read_at`;

/** Messages older than this are deleted by the scheduled check. */
export const COACH_MESSAGE_RETENTION_DAYS = 30;

export const DEFAULT_COACH_CHECKIN_SETTINGS: CoachCheckinSettings = {
  enabled: false,
  coach_ids: [],
  checkin_hour: COACH_CHECKIN_DEFAULT_HOUR,
  ai_wording: false,
};

export interface DueCheckin extends CoachCheckinSettings {
  user_id: string;
  /** The person's day (YYYY-MM-DD) last evaluated, or null. */
  last_evaluated_day: string | null;
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapSettings(row: Record<string, unknown>): CoachCheckinSettings {
  return {
    enabled: Boolean(row.enabled),
    coach_ids: Array.isArray(row.coach_ids) ? row.coach_ids.map(String) : [],
    checkin_hour: Number(row.checkin_hour),
    ai_wording: Boolean(row.ai_wording),
  };
}

function isTriggerType(value: unknown): value is CoachTriggerType {
  return (COACH_TRIGGER_TYPES as readonly unknown[]).includes(value);
}

/** Null for a trigger type this server does not know, e.g. after a downgrade. */
function mapMessage(row: Record<string, unknown>): CoachMessage | null {
  if (!isTriggerType(row.trigger_type)) return null;
  const facts: Record<string, number> = {};
  if (row.facts && typeof row.facts === 'object') {
    for (const [key, value] of Object.entries(row.facts)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        facts[key] = value;
      }
    }
  }
  return {
    id: String(row.id),
    coach_id: String(row.coach_id),
    trigger_type: row.trigger_type,
    entry_date: String(row.entry_date),
    facts,
    text: row.ai_text === null ? null : String(row.ai_text),
    created_at: toIso(row.created_at),
    read_at: row.read_at ? toIso(row.read_at) : null,
  };
}

export async function getSettings(
  userId: string
): Promise<CoachCheckinSettings> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT enabled, coach_ids, checkin_hour, ai_wording
       FROM coach_checkin_settings WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]
      ? mapSettings(result.rows[0])
      : { ...DEFAULT_COACH_CHECKIN_SETTINGS };
  } finally {
    client.release();
  }
}

/** Changes only the fields sent; creates the row with defaults when missing. */
export async function saveSettings(
  userId: string,
  data: UpdateCoachCheckinSettingsBody
): Promise<CoachCheckinSettings> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `INSERT INTO coach_checkin_settings (
         user_id, enabled, coach_ids, checkin_hour, ai_wording
       ) VALUES (
         $1, COALESCE($2, FALSE), COALESCE($3::text[], '{}'),
         COALESCE($4, ${COACH_CHECKIN_DEFAULT_HOUR}), COALESCE($5, FALSE)
       )
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = COALESCE($2, coach_checkin_settings.enabled),
         coach_ids = COALESCE($3::text[], coach_checkin_settings.coach_ids),
         checkin_hour = COALESCE($4, coach_checkin_settings.checkin_hour),
         ai_wording = COALESCE($5, coach_checkin_settings.ai_wording),
         updated_at = NOW()
       RETURNING enabled, coach_ids, checkin_hour, ai_wording`,
      [
        userId,
        data.enabled ?? null,
        data.coach_ids ?? null,
        data.checkin_hour ?? null,
        data.ai_wording ?? null,
      ]
    );
    return mapSettings(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Everyone with check-ins switched on and at least one coach chosen. Read
 * across accounts by the scheduled job, so it uses the system client; all
 * work for a person then runs under their own RLS context.
 */
export async function listEnabledCheckins(): Promise<DueCheckin[]> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT user_id, enabled, coach_ids, checkin_hour, ai_wording,
              last_evaluated_day::text AS last_evaluated_day
       FROM public.coach_checkin_settings
       WHERE enabled = TRUE AND cardinality(coach_ids) > 0`
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      ...mapSettings(row),
      user_id: String(row.user_id),
      last_evaluated_day: row.last_evaluated_day
        ? String(row.last_evaluated_day)
        : null,
    }));
  } finally {
    client.release();
  }
}

/**
 * Claims `day` for this person's scheduled check. False when it was already
 * evaluated, so two runs never both do the work.
 */
export async function claimEvaluationDay(
  userId: string,
  day: string
): Promise<boolean> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `UPDATE coach_checkin_settings
       SET last_evaluated_day = $2::date
       WHERE user_id = $1
         AND (last_evaluated_day IS NULL OR last_evaluated_day < $2::date)`,
      [userId, day]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export interface CheckinDayFacts {
  loggedDays: string[];
  yesterdayWorkouts: number;
  workoutsLast3Days: number;
  lastNightSleepHours: number | null;
}

/** The exercise, logging and sleep facts the trigger rules read. */
export async function getCheckinDayFacts(
  userId: string,
  today: string
): Promise<CheckinDayFacts> {
  const client = await getClient(userId, userId);
  try {
    // 400 days covers the longest streak milestone. A device's synced
    // "Active Calories" row is neither a workout nor the person logging.
    const logged = await client.query(
      `SELECT DISTINCT entry_date::text AS day FROM (
         SELECT entry_date FROM food_entries
           WHERE user_id = $1 AND entry_date > ($2::date - 400) AND entry_date <= $2::date
         UNION
         SELECT entry_date FROM exercise_entries
           WHERE user_id = $1 AND entry_date > ($2::date - 400) AND entry_date <= $2::date
             AND ${LOGGED_WORKOUT_SQL}
         UNION
         SELECT entry_date FROM check_in_measurements
           WHERE user_id = $1 AND entry_date > ($2::date - 400) AND entry_date <= $2::date
       ) d ORDER BY day DESC`,
      [userId, today]
    );
    const workouts = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE entry_date = ($2::date - 1))::int AS yesterday,
         COUNT(*)::int AS last3
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date >= ($2::date - 3) AND entry_date < $2::date
         AND ${LOGGED_WORKOUT_SQL}`,
      [userId, today]
    );
    // The most recent night: today's main sleep, else yesterday's.
    const sleep = await client.query(
      `SELECT COALESCE(time_asleep_in_seconds, duration_in_seconds) AS seconds
       FROM (
         SELECT DISTINCT ON (entry_date) entry_date, time_asleep_in_seconds,
                duration_in_seconds
         FROM sleep_entries
         WHERE user_id = $1 AND entry_date IN ($2::date, $2::date - 1)
         ORDER BY ${MAIN_SLEEP_ORDER_SQL}
       ) nights
       ORDER BY entry_date DESC LIMIT 1`,
      [userId, today]
    );
    const seconds = Number(sleep.rows[0]?.seconds);
    return {
      loggedDays: logged.rows.map((row: { day: string }) => row.day),
      yesterdayWorkouts: Number(workouts.rows[0]?.yesterday) || 0,
      workoutsLast3Days: Number(workouts.rows[0]?.last3) || 0,
      lastNightSleepHours:
        Number.isFinite(seconds) && seconds > 0 ? seconds / 3600 : null,
    };
  } finally {
    client.release();
  }
}

export async function countMessagesOnDay(
  userId: string,
  day: string
): Promise<number> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM coach_messages
       WHERE user_id = $1 AND entry_date = $2::date`,
      [userId, day]
    );
    return Number(result.rows[0]?.total) || 0;
  } finally {
    client.release();
  }
}

/** Whether this coach already raised this trigger within the last `days`. */
export async function hasRecentMessage(
  userId: string,
  coachId: string,
  type: CoachTriggerType,
  day: string,
  days: number
): Promise<boolean> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT 1 FROM coach_messages
       WHERE user_id = $1 AND coach_id = $2 AND trigger_type = $3
         AND entry_date > ($4::date - $5::int) AND entry_date <= $4::date
       LIMIT 1`,
      [userId, coachId, type, day, days]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/** False when the same message already exists for that day. */
export async function insertMessage(
  userId: string,
  coachId: string,
  trigger: CoachTrigger,
  day: string,
  aiText: string | null
): Promise<boolean> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `INSERT INTO coach_messages (
         user_id, coach_id, trigger_type, entry_date, facts, ai_text
       ) VALUES ($1, $2, $3, $4::date, $5::jsonb, $6)
       ON CONFLICT ON CONSTRAINT coach_messages_once_per_day DO NOTHING`,
      [
        userId,
        coachId,
        trigger.type,
        day,
        JSON.stringify(trigger.facts),
        aiText,
      ]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Messages not yet dismissed, newest first. */
export async function listMessages(
  userId: string,
  limit = 20
): Promise<CoachMessage[]> {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `SELECT ${MESSAGE_COLUMNS} FROM coach_messages
       WHERE user_id = $1 AND dismissed_at IS NULL
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    const messages: CoachMessage[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      const message = mapMessage(row);
      if (message) messages.push(message);
    }
    return messages;
  } finally {
    client.release();
  }
}

/** Marks a message read or dismissed; false when it is not this person's. */
export async function markMessage(
  userId: string,
  id: string,
  action: 'read' | 'dismiss'
): Promise<boolean> {
  const column = action === 'read' ? 'read_at' : 'dismissed_at';
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      `UPDATE coach_messages
       SET ${column} = COALESCE(${column}, NOW()),
           read_at = COALESCE(read_at, NOW())
       WHERE user_id = $1 AND id = $2`,
      [userId, id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function deleteOldMessages(): Promise<number> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `DELETE FROM public.coach_messages
       WHERE created_at < NOW() - make_interval(days => $1)`,
      [COACH_MESSAGE_RETENTION_DAYS]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
