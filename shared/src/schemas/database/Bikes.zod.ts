import { z } from "zod";

export const bikesIdSchema = z.string();

export const bikesSchema = z.object({
  id: bikesIdSchema,
  user_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price: z.number().nullable(),
  starting_distance_km: z.number(),
  starting_moving_time_seconds: z.number(),
  status: z.enum(["active", "retired"]),
  is_default: z.boolean(),
  retired_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const bikesInitializerSchema = z.object({
  id: bikesIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  purchase_price: z.number().optional().nullable(),
  starting_distance_km: z.number().optional().default(0),
  starting_moving_time_seconds: z.number().optional().default(0),
  status: z.enum(["active", "retired"]).optional().default("active"),
  is_default: z.boolean().optional().default(false),
  retired_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const bikesMutatorSchema = bikesInitializerSchema.partial();

export type Bikes = z.infer<typeof bikesSchema>;
export type BikesInitializer = z.infer<typeof bikesInitializerSchema>;
export type BikesMutator = z.infer<typeof bikesMutatorSchema>;
