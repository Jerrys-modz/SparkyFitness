import { getClient } from '../db/poolManager.js';
import type {
  CreateShoppingListItemBody,
  ShoppingListItem,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

const COLUMNS = `id, name, quantity, unit, note, is_checked, checked_at,
  created_at, updated_at`;

function mapRow(row: Record<string, unknown>): ShoppingListItem {
  return {
    id: String(row.id),
    name: String(row.name),
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit ? String(row.unit) : null,
    note: row.note ? String(row.note) : null,
    is_checked: Boolean(row.is_checked),
    checked_at: row.checked_at
      ? new Date(row.checked_at as string).toISOString()
      : null,
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

/** Empty strings from the form mean "none". */
function blankToNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** Unchecked items first, oldest first; then checked items, latest first. */
export async function listShoppingListItems(
  userId: string,
  authenticatedUserId?: string
): Promise<ShoppingListItem[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM shopping_list_items
        WHERE user_id = $1
        ORDER BY is_checked ASC,
                 CASE WHEN is_checked THEN NULL ELSE created_at END ASC,
                 checked_at DESC NULLS LAST`,
      [userId]
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function createShoppingListItem(
  userId: string,
  body: CreateShoppingListItemBody,
  authenticatedUserId?: string
): Promise<ShoppingListItem> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO shopping_list_items (user_id, name, quantity, unit, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        userId,
        body.name,
        body.quantity ?? null,
        blankToNull(body.unit),
        blankToNull(body.note),
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/** Changes the fields sent; returns null when the item is not the person's. */
export async function updateShoppingListItem(
  userId: string,
  id: string,
  body: UpdateShoppingListItemBody,
  authenticatedUserId?: string
): Promise<ShoppingListItem | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE shopping_list_items SET
         name = CASE WHEN $3::boolean THEN $4 ELSE name END,
         quantity = CASE WHEN $5::boolean THEN $6 ELSE quantity END,
         unit = CASE WHEN $7::boolean THEN $8 ELSE unit END,
         note = CASE WHEN $9::boolean THEN $10 ELSE note END,
         is_checked = CASE WHEN $11::boolean THEN $12 ELSE is_checked END,
         checked_at = CASE WHEN $11::boolean
                           THEN CASE WHEN $12 THEN NOW() ELSE NULL END
                           ELSE checked_at END,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${COLUMNS}`,
      [
        id,
        userId,
        body.name !== undefined,
        body.name ?? null,
        body.quantity !== undefined,
        body.quantity ?? null,
        body.unit !== undefined,
        blankToNull(body.unit),
        body.note !== undefined,
        blankToNull(body.note),
        body.is_checked !== undefined,
        body.is_checked ?? false,
      ]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteShoppingListItem(
  userId: string,
  id: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM shopping_list_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Removes every checked item and returns how many there were. */
export async function clearCheckedShoppingListItems(
  userId: string,
  authenticatedUserId?: string
): Promise<number> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM shopping_list_items WHERE user_id = $1 AND is_checked',
      [userId]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
