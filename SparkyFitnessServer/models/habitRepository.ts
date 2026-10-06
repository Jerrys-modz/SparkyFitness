import { getClient } from '../db/poolManager.js';

// Habits are custom_categories rows with data_type = 'boolean'; completions
// are custom_measurements rows with value 'true'/'false'. Used by the chatbot
// habit tools (ai/tools/habitTools.ts).

async function listHabits(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, name, display_name, measurement_type, frequency, data_type
       FROM custom_categories
       WHERE user_id = $1 AND data_type = 'boolean'
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function upsertHabitLog(
  userId: string,
  habitId: string,
  entryDate: string,
  value: string
) {
  const client = await getClient(userId);
  try {
    // Check if an entry exists first to avoid ON CONFLICT errors if the
    // unique constraint is missing
    const existing = await client.query(
      'SELECT id FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date = $3 LIMIT 1',
      [userId, habitId, entryDate]
    );

    if (existing.rows.length > 0) {
      await client.query(
        'UPDATE custom_measurements SET value = $1, updated_at = NOW() WHERE id = $2',
        [value, existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO custom_measurements (user_id, category_id, value, entry_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, habitId, value, entryDate]
      );
    }
  } finally {
    client.release();
  }
}

async function getHabitHistory(
  userId: string,
  habitId: string,
  startDate?: string,
  endDate?: string
) {
  const client = await getClient(userId);
  try {
    let query = `
      SELECT id, value, entry_date, created_at
      FROM custom_measurements
      WHERE user_id = $1 AND category_id = $2
    `;
    const queryParams: unknown[] = [userId, habitId];
    let paramIdx = 3;

    if (startDate) {
      query += ` AND entry_date >= $${paramIdx}`;
      queryParams.push(startDate);
      paramIdx++;
    }
    if (endDate) {
      query += ` AND entry_date <= $${paramIdx}`;
      queryParams.push(endDate);
      paramIdx++;
    }

    query += ' ORDER BY entry_date ASC';

    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

async function createHabit(userId: string, name: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO custom_categories (user_id, name, display_name, frequency, measurement_type, data_type, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $2, 'Daily', 'habit', 'boolean', $1, $1, now(), now())
       RETURNING id, name, display_name`,
      [userId, name]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteHabit(userId: string, habitId: string) {
  const client = await getClient(userId);
  try {
    // custom_measurements.category_id has no foreign key, so remove the
    // completion rows explicitly to avoid orphans.
    await client.query('BEGIN');
    try {
      const owned = await client.query(
        `DELETE FROM custom_categories
         WHERE id = $1 AND user_id = $2 AND data_type = 'boolean'`,
        [habitId, userId]
      );
      if ((owned.rowCount ?? 0) > 0) {
        await client.query(
          'DELETE FROM custom_measurements WHERE category_id = $1 AND user_id = $2',
          [habitId, userId]
        );
      }
      await client.query('COMMIT');
      return (owned.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

async function habitExists(userId: string, habitId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT 1 FROM custom_categories
       WHERE id = $1 AND user_id = $2 AND data_type = 'boolean'`,
      [habitId, userId]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

async function listHabitLogsInRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT cm.category_id AS habit_id,
              to_char(cm.entry_date, 'YYYY-MM-DD') AS entry_date,
              (cm.value = 'true') AS completed
       FROM custom_measurements cm
       JOIN custom_categories cc ON cc.id = cm.category_id
       WHERE cm.user_id = $1 AND cc.data_type = 'boolean'
         AND cm.entry_date >= $2 AND cm.entry_date <= $3
       ORDER BY cm.entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export {
  listHabits,
  upsertHabitLog,
  getHabitHistory,
  createHabit,
  deleteHabit,
  habitExists,
  listHabitLogsInRange,
};
export default {
  listHabits,
  upsertHabitLog,
  getHabitHistory,
  createHabit,
  deleteHabit,
  habitExists,
  listHabitLogsInRange,
};
