import { z } from "zod";

export const bikeStatusSchema = z.enum(["active", "retired"]);
export type BikeStatus = z.infer<typeof bikeStatusSchema>;

export const BIKE_COMPONENT_TYPES = [
  "chain",
  "cassette",
  "tires",
  "brake_pads",
  "cables",
  "bar_tape",
  "custom",
] as const;
export const bikeComponentTypeSchema = z.enum(BIKE_COMPONENT_TYPES);
export type BikeComponentType = z.infer<typeof bikeComponentTypeSchema>;

export const bikeComponentStatusSchema = z.enum(["active", "retired"]);
export type BikeComponentStatus = z.infer<typeof bikeComponentStatusSchema>;

/**
 * Expected life used when a component is added without one, per type. Rough
 * rules of thumb for road riding; the rider edits them per component.
 */
export const DEFAULT_COMPONENT_LIFE: Record<
  BikeComponentType,
  { km: number | null; hours: number | null }
> = {
  chain: { km: 4000, hours: null },
  cassette: { km: 12000, hours: null },
  tires: { km: 5000, hours: null },
  brake_pads: { km: 3000, hours: null },
  cables: { km: 10000, hours: null },
  bar_tape: { km: 6000, hours: null },
  custom: { km: 5000, hours: null },
};

/** Wear percentage from which a component is flagged as due soon. */
export const COMPONENT_DUE_SOON_PERCENT = 80;
/** Wear percentage from which a component is due now. */
export const COMPONENT_DUE_NOW_PERCENT = 100;

export const componentWearStateSchema = z.enum(["ok", "due_soon", "due_now"]);
export type ComponentWearState = z.infer<typeof componentWearStateSchema>;

export interface ComponentWearInput {
  distanceKm: number;
  hours: number;
  expectedLifeKm: number | null;
  expectedLifeHours: number | null;
}

/**
 * Wear is the larger of the distance and hours ratios, so a component with
 * both limits is due when either is reached. It is not capped: 130 means 30%
 * past its expected life.
 */
export function computeComponentWear(input: ComponentWearInput): {
  wearPercent: number;
  state: ComponentWearState;
} {
  const ratios: number[] = [];
  if (input.expectedLifeKm != null && input.expectedLifeKm > 0) {
    ratios.push(input.distanceKm / input.expectedLifeKm);
  }
  if (input.expectedLifeHours != null && input.expectedLifeHours > 0) {
    ratios.push(input.hours / input.expectedLifeHours);
  }
  const wearPercent = Math.round(Math.max(0, ...ratios) * 100 * 10) / 10;
  const state: ComponentWearState =
    wearPercent >= COMPONENT_DUE_NOW_PERCENT
      ? "due_now"
      : wearPercent >= COMPONENT_DUE_SOON_PERCENT
        ? "due_soon"
        : "ok";
  return { wearPercent, state };
}

const bikeDaySchema = z.iso.date();

// Column precision: purchase_price is NUMERIC(10, 2), distances NUMERIC(9, 2),
// hours NUMERIC(8, 2), moving time INTEGER seconds.
const MAX_BIKE_PRICE = 99_999_999.99;
const MAX_BIKE_DISTANCE_KM = 9_999_999.99;
const MAX_COMPONENT_HOURS = 999_999.99;
const MAX_MOVING_TIME_SECONDS = 2_000_000_000;

export const createBikeBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  purchase_date: bikeDaySchema.nullable().optional(),
  purchase_price: z.number().min(0).max(MAX_BIKE_PRICE).nullable().optional(),
  starting_distance_km: z.number().min(0).max(MAX_BIKE_DISTANCE_KM).optional(),
  starting_moving_time_seconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_MOVING_TIME_SECONDS)
    .optional(),
  is_default: z.boolean().optional(),
});
export type CreateBikeBody = z.infer<typeof createBikeBodySchema>;

export const updateBikeBodySchema = createBikeBodySchema.partial().extend({
  status: bikeStatusSchema.optional(),
});
export type UpdateBikeBody = z.infer<typeof updateBikeBodySchema>;

export const bikeComponentResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  bike_id: z.string(),
  component_type: bikeComponentTypeSchema,
  name: z.string(),
  installed_on: z.string(),
  expected_life_km: z.number().nullable(),
  expected_life_hours: z.number().nullable(),
  status: bikeComponentStatusSchema,
  retired_on: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Distance of rides on the bike from installed_on (until retired_on), in km. */
  distance_km: z.number(),
  /** Moving time of those rides, in hours. */
  hours: z.number(),
  ride_count: z.number(),
  /** Larger of the distance and hours ratios, as a percentage; may exceed 100. */
  wear_percent: z.number(),
  wear_state: componentWearStateSchema,
});
export type BikeComponentResponse = z.infer<typeof bikeComponentResponseSchema>;

export const bikeResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price: z.number().nullable(),
  starting_distance_km: z.number(),
  starting_moving_time_seconds: z.number(),
  status: bikeStatusSchema,
  is_default: z.boolean(),
  retired_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Distance of linked rides, in kilometres. */
  logged_distance_km: z.number(),
  /** starting_distance_km + logged_distance_km. */
  total_distance_km: z.number(),
  /** Moving time of linked rides, in seconds. */
  logged_moving_time_seconds: z.number(),
  /** starting_moving_time_seconds + logged_moving_time_seconds. */
  total_moving_time_seconds: z.number(),
  ride_count: z.number(),
  last_used_date: z.string().nullable(),
  /** Active components at or past their expected life. */
  due_now_component_count: z.number(),
  /** Active components between the due-soon and due-now thresholds. */
  due_soon_component_count: z.number(),
});
export type BikeResponse = z.infer<typeof bikeResponseSchema>;

export const bikeListResponseSchema = z.array(bikeResponseSchema);
export type BikeListResponse = z.infer<typeof bikeListResponseSchema>;

/** A bike with every component, active first and then the retired history. */
export const bikeDetailResponseSchema = bikeResponseSchema.extend({
  components: z.array(bikeComponentResponseSchema),
});
export type BikeDetailResponse = z.infer<typeof bikeDetailResponseSchema>;

const componentLifeFields = {
  expected_life_km: z.number().positive().max(MAX_BIKE_DISTANCE_KM),
  expected_life_hours: z.number().positive().max(MAX_COMPONENT_HOURS),
};

export const createBikeComponentBodySchema = z.object({
  component_type: bikeComponentTypeSchema,
  /** Defaults to the readable type name on the client; required for custom. */
  name: z.string().trim().min(1).max(120),
  installed_on: bikeDaySchema,
  /** Both omitted (or null): the type's default kilometres are used. */
  expected_life_km: componentLifeFields.expected_life_km.nullable().optional(),
  expected_life_hours: componentLifeFields.expected_life_hours
    .nullable()
    .optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateBikeComponentBody = z.infer<
  typeof createBikeComponentBodySchema
>;

/** Editing never changes the type, the bike or the retirement state. */
export const updateBikeComponentBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  installed_on: bikeDaySchema.optional(),
  expected_life_km: componentLifeFields.expected_life_km.nullable().optional(),
  expected_life_hours: componentLifeFields.expected_life_hours
    .nullable()
    .optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateBikeComponentBody = z.infer<
  typeof updateBikeComponentBodySchema
>;

/** Retire a component; the day defaults to today in the user's timezone. */
export const retireBikeComponentBodySchema = z.object({
  retired_on: bikeDaySchema.optional(),
});
export type RetireBikeComponentBody = z.infer<
  typeof retireBikeComponentBodySchema
>;

/**
 * Replace a component: the old one is retired and a new one of the same type
 * is installed on `replaced_on` with a fresh counter. Unset fields inherit
 * from the old component.
 */
export const replaceBikeComponentBodySchema = z.object({
  replaced_on: bikeDaySchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  expected_life_km: componentLifeFields.expected_life_km.nullable().optional(),
  expected_life_hours: componentLifeFields.expected_life_hours
    .nullable()
    .optional(),
});
export type ReplaceBikeComponentBody = z.infer<
  typeof replaceBikeComponentBodySchema
>;

export const replaceBikeComponentResponseSchema = z.object({
  retired: bikeComponentResponseSchema,
  installed: bikeComponentResponseSchema,
});
export type ReplaceBikeComponentResponse = z.infer<
  typeof replaceBikeComponentResponseSchema
>;

/** Body for linking (or unlinking, with null) a bike to a diary entry. */
export const assignBikeBodySchema = z.object({
  bike_id: z.string().uuid().nullable(),
});
export type AssignBikeBody = z.infer<typeof assignBikeBodySchema>;

export const assignBikeResponseSchema = z.object({
  exercise_entry_id: z.string(),
  bike_id: z.string().nullable(),
});
export type AssignBikeResponse = z.infer<typeof assignBikeResponseSchema>;
