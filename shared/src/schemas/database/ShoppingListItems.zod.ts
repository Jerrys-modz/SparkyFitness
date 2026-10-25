import { z } from 'zod';

export const shoppingListItemsIdSchema = z.string();

export const shoppingListItemsRowSchema = z.object({
  id: shoppingListItemsIdSchema,
  user_id: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
  is_checked: z.boolean(),
  checked_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const shoppingListItemsInitializerSchema = z.object({
  id: shoppingListItemsIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  is_checked: z.boolean().optional(),
  checked_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const shoppingListItemsMutatorSchema = z.object({
  id: shoppingListItemsIdSchema.optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  is_checked: z.boolean().optional(),
  checked_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type ShoppingListItemsRow = z.infer<typeof shoppingListItemsRowSchema>;
export type ShoppingListItemsInitializer = z.infer<
  typeof shoppingListItemsInitializerSchema
>;
export type ShoppingListItemsMutator = z.infer<
  typeof shoppingListItemsMutatorSchema
>;
