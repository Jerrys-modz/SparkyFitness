import { getClient } from '../db/poolManager.js';

export interface DeleteImportedLabResultsOutcome {
  /** Results that were removed. */
  results: number;
  /** Lab markers removed because nothing was left in them. */
  markers: number;
}

/**
 * Deletes the results a lab report import saved: every one with an `import_id`
 * (or just those of one import), then the lab markers that are left with no
 * results at all. A marker only exists once a result is saved to it, so an
 * emptied one holds nothing worth keeping.
 */
export async function deleteImportedLabResults(
  userId: string,
  importId?: string | null
): Promise<DeleteImportedLabResultsOutcome> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const deleted = await client.query(
      `DELETE FROM custom_measurements
       WHERE user_id = $1 AND import_id IS NOT NULL
         AND ($2::uuid IS NULL OR import_id = $2::uuid)`,
      [userId, importId ?? null]
    );
    const emptied = await client.query(
      `DELETE FROM custom_categories cc
       WHERE cc.user_id = $1 AND cc.is_lab
         AND NOT EXISTS (
           SELECT 1 FROM custom_measurements cm WHERE cm.category_id = cc.id
         )`,
      [userId]
    );
    await client.query('COMMIT');
    return { results: deleted.rowCount ?? 0, markers: emptied.rowCount ?? 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes one lab marker and every result saved to it. Custom measurements do
 * not reference their category by foreign key, so removing only the category
 * would leave its results behind. Returns null when the id is not one of the
 * user's lab markers, so this cannot be used to delete another kind of category.
 */
export async function deleteLabMarkerWithResults(
  userId: string,
  categoryId: string
): Promise<{ results: number } | null> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const marker = await client.query(
      'SELECT id FROM custom_categories WHERE id = $1 AND user_id = $2 AND is_lab',
      [categoryId, userId]
    );
    if (marker.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const deleted = await client.query(
      'DELETE FROM custom_measurements WHERE user_id = $1 AND category_id = $2',
      [userId, categoryId]
    );
    await client.query(
      'DELETE FROM custom_categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );
    await client.query('COMMIT');
    return { results: deleted.rowCount ?? 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default { deleteImportedLabResults, deleteLabMarkerWithResults };
