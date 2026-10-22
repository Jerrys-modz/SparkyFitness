import { getClient } from '../db/poolManager.js';
import {
  COACHING_DEFAULT_RATE_KG_PER_WEEK,
  type CoachingSettings,
  type UpdateCoachingSettingsBody,
} from '@workspace/shared';

interface CoachingSettingsRow {
  coaching_goal_direction: CoachingSettings['direction'];
  coaching_rate_kg_per_week: string | number;
  coaching_check_in_weekday: number;
}

const DEFAULT_SETTINGS: CoachingSettings = {
  direction: 'maintain',
  rateKgPerWeek: COACHING_DEFAULT_RATE_KG_PER_WEEK,
  checkInWeekday: 0,
};

function toSettings(row: CoachingSettingsRow): CoachingSettings {
  return {
    direction: row.coaching_goal_direction,
    rateKgPerWeek: Number(row.coaching_rate_kg_per_week),
    checkInWeekday: Number(row.coaching_check_in_weekday),
  };
}

async function getCoachingSettings(
  userId: string,
  authenticatedUserId: string
): Promise<CoachingSettings> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT coaching_goal_direction, coaching_rate_kg_per_week, coaching_check_in_weekday
         FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    // No preferences row yet means the column defaults.
    const row = result.rows[0] as CoachingSettingsRow | undefined;
    return row ? toSettings(row) : DEFAULT_SETTINGS;
  } finally {
    client.release();
  }
}

/** Saves only the settings given; the rest keep their stored (or default) value. */
async function updateCoachingSettings(
  userId: string,
  patch: UpdateCoachingSettingsBody
): Promise<CoachingSettings> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
         user_id, coaching_goal_direction, coaching_rate_kg_per_week,
         coaching_check_in_weekday, created_at, updated_at
       ) VALUES (
         $1, COALESCE($2, 'maintain'), COALESCE($3, ${COACHING_DEFAULT_RATE_KG_PER_WEEK}),
         COALESCE($4, 0), now(), now()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         coaching_goal_direction = COALESCE($2, user_preferences.coaching_goal_direction),
         coaching_rate_kg_per_week = COALESCE($3, user_preferences.coaching_rate_kg_per_week),
         coaching_check_in_weekday = COALESCE($4, user_preferences.coaching_check_in_weekday),
         updated_at = now()
       RETURNING coaching_goal_direction, coaching_rate_kg_per_week, coaching_check_in_weekday`,
      [
        userId,
        patch.direction ?? null,
        patch.rateKgPerWeek ?? null,
        patch.checkInWeekday ?? null,
      ]
    );
    return toSettings(result.rows[0] as CoachingSettingsRow);
  } finally {
    client.release();
  }
}

export { getCoachingSettings, updateCoachingSettings };
export default { getCoachingSettings, updateCoachingSettings };
