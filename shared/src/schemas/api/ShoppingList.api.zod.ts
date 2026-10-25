import { z } from 'zod';

export const shoppingListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
  is_checked: z.boolean(),
  checked_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;

/** Unchecked items first (oldest first), then checked items (latest first). */
export const getShoppingListResponseSchema = z.object({
  items: z.array(shoppingListItemSchema),
});
export type GetShoppingListResponse = z.infer<
  typeof getShoppingListResponseSchema
>;

const nameSchema = z.string().trim().min(1).max(200);
const quantitySchema = z.number().positive().max(100000);
const unitSchema = z.string().trim().max(50);
const noteSchema = z.string().trim().max(500);

export const createShoppingListItemBodySchema = z.object({
  name: nameSchema,
  quantity: quantitySchema.nullish(),
  unit: unitSchema.nullish(),
  note: noteSchema.nullish(),
});
export type CreateShoppingListItemBody = z.infer<
  typeof createShoppingListItemBodySchema
>;

/** Only the fields sent change; null clears quantity, unit or note. */
export const updateShoppingListItemBodySchema = z
  .object({
    name: nameSchema,
    quantity: quantitySchema.nullable(),
    unit: unitSchema.nullable(),
    note: noteSchema.nullable(),
    is_checked: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateShoppingListItemBody = z.infer<
  typeof updateShoppingListItemBodySchema
>;

export const clearCheckedShoppingListResponseSchema = z.object({
  deleted: z.number().int().min(0),
});
export type ClearCheckedShoppingListResponse = z.infer<
  typeof clearCheckedShoppingListResponseSchema
>;
