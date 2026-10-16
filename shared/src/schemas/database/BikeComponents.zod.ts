import { z } from "zod";

export const bikeComponentsIdSchema = z.string();

export const bikeComponentsSchema = z.object({
  id: bikeComponentsIdSchema,
  user_id: z.string(),
  bike_id: z.string(),
  component_type: z.enum([
    "chain",
    "cassette",
    "tires",
    "brake_pads",
    "cables",
    "bar_tape",
    "custom",
  ]),
  name: z.string(),
  installed_on: z.string(),
  expected_life_km: z.number().nullable(),
  expected_life_hours: z.number().nullable(),
  status: z.enum(["active", "retired"]),
  retired_on: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const bikeComponentsInitializerSchema = z.object({
  id: bikeComponentsIdSchema.optional(),
  user_id: z.string(),
  bike_id: z.string(),
  component_type: bikeComponentsSchema.shape.component_type,
  name: z.string(),
  installed_on: z.string(),
  expected_life_km: z.number().optional().nullable(),
  expected_life_hours: z.number().optional().nullable(),
  status: z.enum(["active", "retired"]).optional().default("active"),
  retired_on: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const bikeComponentsMutatorSchema =
  bikeComponentsInitializerSchema.partial();

export type BikeComponents = z.infer<typeof bikeComponentsSchema>;
export type BikeComponentsInitializer = z.infer<
  typeof bikeComponentsInitializerSchema
>;
export type BikeComponentsMutator = z.infer<typeof bikeComponentsMutatorSchema>;
