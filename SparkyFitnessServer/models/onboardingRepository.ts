import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
/**
 * Saves onboarding data and updates the user's status to complete.
 * This function uses a transaction to ensure atomicity.
 * @param {string} userId - The UUID of the user.
 * @param {object} data - The onboarding form data.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveOnboardingData(userId: any, data: any) {
  const {
    sex,
    primaryGoal,
    currentWeight,
    height,
    birthDate,
    bodyFatRange,
    targetWeight,
    mealsPerDay,
    activityLevel,
    addBurnedCalories,
  } = data;
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // Query 1: Insert or update the detailed onboarding data.
    const onboardingQuery = `
      INSERT INTO onboarding_data (
        user_id, sex, primary_goal, current_weight, height, birth_date,
        body_fat_range, target_weight, meals_per_day, activity_level, add_burned_calories
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id) DO UPDATE SET
        sex = EXCLUDED.sex, primary_goal = EXCLUDED.primary_goal, current_weight = EXCLUDED.current_weight,
        height = EXCLUDED.height, birth_date = EXCLUDED.birth_date, body_fat_range = EXCLUDED.body_fat_range,
        target_weight = EXCLUDED.target_weight, meals_per_day = EXCLUDED.meals_per_day,
        activity_level = EXCLUDED.activity_level, add_burned_calories = EXCLUDED.add_burned_calories;
    `;
    await client.query(onboardingQuery, [
      userId,
      sex,
      primaryGoal,
      currentWeight,
      height,
      birthDate,
      bodyFatRange,
      targetWeight,
      mealsPerDay,
      activityLevel,
      addBurnedCalories,
    ]);
    // Query 2: Mark onboarding as complete and clear any skipped flag.
    const statusQuery = `
      UPDATE onboarding_status
      SET onboarding_complete = TRUE, onboarding_skipped = FALSE, updated_at = NOW()
      WHERE user_id = $1;
    `;
    await client.query(statusQuery, [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in saveOnboardingData repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Fetches the onboarding completion status for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<object|null>} The database row or null if not found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOnboardingStatus(userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT onboarding_complete, onboarding_skipped FROM onboarding_status WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error in getOnboardingStatus repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Resets the onboarding completion status for a given user to FALSE.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetOnboardingStatus(userId: any) {
  const client = await getClient(userId);
  try {
    const query = `
      UPDATE onboarding_status
      SET onboarding_complete = FALSE, updated_at = NOW()
      WHERE user_id = $1;
    `;
    await client.query(query, [userId]);
  } catch (error) {
    console.error('Error in resetOnboardingStatus repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Marks the onboarding wizard as skipped for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setOnboardingSkipped(userId: any) {
  const client = await getClient(userId);
  try {
    const query = `
      UPDATE onboarding_status
      SET onboarding_skipped = TRUE, updated_at = NOW()
      WHERE user_id = $1;
    `;
    await client.query(query, [userId]);
  } catch (error) {
    log('error', 'Error in setOnboardingSkipped repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/** The saved goal weight with its optional target date, as calendar days. */
export interface StoredGoalWeight {
  targetWeightKg: number | null;
  targetDate: string | null;
  setOn: string | null;
}

/**
 * Reads the user's goal weight, target date and the day they were last set.
 * @param userId - The UUID of the user.
 */
async function getGoalWeight(userId: string): Promise<StoredGoalWeight> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT target_weight,
              TO_CHAR(target_weight_date, 'YYYY-MM-DD') AS target_weight_date,
              TO_CHAR(target_weight_set_on, 'YYYY-MM-DD') AS target_weight_set_on
         FROM onboarding_data WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0] as
      | {
          target_weight: string | number | null;
          target_weight_date: string | null;
          target_weight_set_on: string | null;
        }
      | undefined;
    const kg =
      row?.target_weight === null || row?.target_weight === undefined
        ? null
        : Number(row.target_weight);
    return {
      targetWeightKg: kg !== null && Number.isFinite(kg) && kg > 0 ? kg : null,
      targetDate: row?.target_weight_date ?? null,
      setOn: row?.target_weight_set_on ?? null,
    };
  } finally {
    client.release();
  }
}

/**
 * Sets or clears the user's target weight and, when given, its target date,
 * creating the onboarding row when the user skipped onboarding. Clearing the
 * weight clears the date. `target_weight_set_on` moves to `today` only when the
 * weight or the date actually changes, so re-saving keeps the planned path.
 * @param userId - The UUID of the user.
 * @param targetWeightKg - Target weight in kg, or null to clear it.
 * @param targetDate - YYYY-MM-DD, null to clear, or undefined to keep the saved date.
 * @param today - Today in the user's timezone.
 */
async function setTargetWeight(
  userId: string,
  targetWeightKg: number | null,
  targetDate?: string | null,
  today?: string
) {
  const client = await getClient(userId);
  try {
    const keepDate = targetDate === undefined;
    await client.query(
      `INSERT INTO onboarding_data (user_id, target_weight, target_weight_date, target_weight_set_on)
       VALUES ($1, $2::numeric, CASE WHEN $2::numeric IS NULL THEN NULL ELSE $3::date END,
               CASE WHEN $2::numeric IS NULL THEN NULL ELSE $5::date END)
       ON CONFLICT (user_id) DO UPDATE SET
         target_weight = EXCLUDED.target_weight,
         target_weight_date = CASE
           WHEN EXCLUDED.target_weight IS NULL THEN NULL
           WHEN $4::boolean THEN onboarding_data.target_weight_date
           ELSE $3::date END,
         target_weight_set_on = CASE
           WHEN EXCLUDED.target_weight IS NULL THEN NULL
           WHEN onboarding_data.target_weight IS DISTINCT FROM EXCLUDED.target_weight
             OR (NOT $4::boolean AND onboarding_data.target_weight_date IS DISTINCT FROM $3::date)
             OR onboarding_data.target_weight_set_on IS NULL
           THEN $5::date
           ELSE onboarding_data.target_weight_set_on END`,
      [
        userId,
        targetWeightKg,
        keepDate ? null : targetDate,
        keepDate,
        today ?? null,
      ]
    );
  } catch (error) {
    log('error', 'Error in setTargetWeight repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Sets or clears only the user's target body fat %, creating the onboarding row
 * when the user skipped onboarding (as `setTargetWeight` does).
 * @param userId - The UUID of the user.
 * @param targetBodyFatPercent - Target body fat in percent, or null to clear it.
 */
async function setTargetBodyFat(
  userId: string,
  targetBodyFatPercent: number | null
) {
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO onboarding_data (user_id, target_body_fat_percentage)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET target_body_fat_percentage = EXCLUDED.target_body_fat_percentage`,
      [userId, targetBodyFatPercent]
    );
  } catch (error) {
    log('error', 'Error in setTargetBodyFat repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * The weight given in the setup wizard and when the row was created. RLS lets
 * the owner and anyone with profile read access see it.
 */
async function getOnboardingStartWeight(userId: string): Promise<{
  current_weight: string | number | null;
  created_at: Date | null;
} | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT current_weight, created_at FROM onboarding_data WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}
export { saveOnboardingData };
export { getOnboardingStartWeight };
export { setTargetWeight };
export { getGoalWeight };
export { setTargetBodyFat };
export { getOnboardingStatus };
export { resetOnboardingStatus };
export { setOnboardingSkipped };
export default {
  saveOnboardingData,
  getOnboardingStartWeight,
  setTargetWeight,
  getGoalWeight,
  setTargetBodyFat,
  getOnboardingStatus,
  resetOnboardingStatus,
  setOnboardingSkipped,
};
