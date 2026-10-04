import { getClient } from '../db/poolManager.js';

export interface FastingPreferencesRecord {
  id?: string;
  user_id: string;
  auto_calculate: boolean;
  default_protocol: string;
  target_fasting_hours: number;
  target_eating_hours: number;
  calorie_threshold: number;
  pre_end_alert_minutes: number;
  eating_window_alert: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export const DEFAULT_FASTING_PREFERENCES: Omit<
  FastingPreferencesRecord,
  'id' | 'user_id' | 'created_at' | 'updated_at'
> = {
  auto_calculate: false,
  default_protocol: '16-8',
  target_fasting_hours: 16.0,
  target_eating_hours: 8.0,
  calorie_threshold: 10,
  pre_end_alert_minutes: 30,
  eating_window_alert: false,
};

async function getFastingPreferences(
  userId: string
): Promise<FastingPreferencesRecord> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT * FROM user_fasting_preferences WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        user_id: userId,
        ...DEFAULT_FASTING_PREFERENCES,
      };
    }

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      auto_calculate: Boolean(row.auto_calculate),
      default_protocol: row.default_protocol || '16-8',
      target_fasting_hours: Number(row.target_fasting_hours ?? 16.0),
      target_eating_hours: Number(row.target_eating_hours ?? 8.0),
      calorie_threshold: Number(row.calorie_threshold ?? 10),
      pre_end_alert_minutes: Number(row.pre_end_alert_minutes ?? 30),
      eating_window_alert: Boolean(row.eating_window_alert),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } finally {
    client.release();
  }
}

async function upsertFastingPreferences(
  userId: string,
  updates: Partial<FastingPreferencesRecord>
): Promise<FastingPreferencesRecord> {
  const client = await getClient(userId);
  try {
    const current = await getFastingPreferences(userId);
    const merged = {
      auto_calculate:
        updates.auto_calculate !== undefined
          ? updates.auto_calculate
          : current.auto_calculate,
      default_protocol:
        updates.default_protocol !== undefined
          ? updates.default_protocol
          : current.default_protocol,
      target_fasting_hours:
        updates.target_fasting_hours !== undefined
          ? updates.target_fasting_hours
          : current.target_fasting_hours,
      target_eating_hours:
        updates.target_eating_hours !== undefined
          ? updates.target_eating_hours
          : current.target_eating_hours,
      calorie_threshold:
        updates.calorie_threshold !== undefined
          ? updates.calorie_threshold
          : current.calorie_threshold,
      pre_end_alert_minutes:
        updates.pre_end_alert_minutes !== undefined
          ? updates.pre_end_alert_minutes
          : current.pre_end_alert_minutes,
      eating_window_alert:
        updates.eating_window_alert !== undefined
          ? updates.eating_window_alert
          : current.eating_window_alert,
    };

    const query = `
      INSERT INTO user_fasting_preferences (
        user_id,
        auto_calculate,
        default_protocol,
        target_fasting_hours,
        target_eating_hours,
        calorie_threshold,
        pre_end_alert_minutes,
        eating_window_alert,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        auto_calculate = EXCLUDED.auto_calculate,
        default_protocol = EXCLUDED.default_protocol,
        target_fasting_hours = EXCLUDED.target_fasting_hours,
        target_eating_hours = EXCLUDED.target_eating_hours,
        calorie_threshold = EXCLUDED.calorie_threshold,
        pre_end_alert_minutes = EXCLUDED.pre_end_alert_minutes,
        eating_window_alert = EXCLUDED.eating_window_alert,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      userId,
      merged.auto_calculate,
      merged.default_protocol,
      merged.target_fasting_hours,
      merged.target_eating_hours,
      merged.calorie_threshold,
      merged.pre_end_alert_minutes,
      merged.eating_window_alert,
    ];

    const result = await client.query(query, values);
    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      auto_calculate: Boolean(row.auto_calculate),
      default_protocol: row.default_protocol,
      target_fasting_hours: Number(row.target_fasting_hours),
      target_eating_hours: Number(row.target_eating_hours),
      calorie_threshold: Number(row.calorie_threshold),
      pre_end_alert_minutes: Number(row.pre_end_alert_minutes),
      eating_window_alert: Boolean(row.eating_window_alert),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } finally {
    client.release();
  }
}

export default {
  getFastingPreferences,
  upsertFastingPreferences,
  DEFAULT_FASTING_PREFERENCES,
};
