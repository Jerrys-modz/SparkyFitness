import { z } from "zod";
import { routeActivitySchema } from "../database/Routes.zod.ts";
import { HEATMAP_MAX_CELLS } from "../../utils/heatmap.ts";

/** Which activity kinds to include; all four when omitted. */
export const heatmapActivitiesSchema = z
  .string()
  .transform((value) => value.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(routeActivitySchema).min(1).max(4));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Query of `GET /api/v2/heatmap`. The viewport is optional (all of the
 * person's tracks when absent); the four corners go together.
 */
export const heatmapQuerySchema = z
  .object({
    activities: heatmapActivitiesSchema.optional(),
    from: day.optional(),
    to: day.optional(),
    minLat: z.coerce.number().min(-90).max(90).optional(),
    maxLat: z.coerce.number().min(-90).max(90).optional(),
    minLon: z.coerce.number().min(-180).max(180).optional(),
    maxLon: z.coerce.number().min(-180).max(180).optional(),
    maxCells: z.coerce
      .number()
      .int()
      .min(50)
      .max(HEATMAP_MAX_CELLS)
      .default(2000),
  })
  .refine(
    (q) => {
      const corners = [q.minLat, q.maxLat, q.minLon, q.maxLon];
      const given = corners.filter((c) => c !== undefined).length;
      return given === 0 || given === 4;
    },
    { message: "Give all four viewport corners or none" }
  )
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "from must not be after to",
    path: ["from"],
  })
  .refine(
    (q) =>
      q.minLat === undefined ||
      q.maxLat === undefined ||
      q.minLat <= q.maxLat,
    { message: "minLat must not exceed maxLat", path: ["minLat"] }
  );

/** One cell: centre latitude, centre longitude, activities that passed through. */
export const heatmapCellSchema = z.tuple([
  z.number(),
  z.number(),
  z.number().int().min(1),
]);

export const heatmapResponseSchema = z.object({
  /** Side of each cell, in metres. */
  cellM: z.number(),
  cells: z.array(heatmapCellSchema),
  maxCount: z.number().int().min(0),
  /** Activities that made up the map. */
  activityCount: z.number().int().min(0),
  /** True when the busiest cells were kept and the rest left out. */
  truncated: z.boolean(),
  /** Box around everything, for framing the map; null with no tracks. */
  bounds: z
    .object({
      minLat: z.number(),
      maxLat: z.number(),
      minLon: z.number(),
      maxLon: z.number(),
    })
    .nullable(),
  /** Day (`YYYY-MM-DD`) of the oldest and newest activity included. */
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
});

export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;
export type HeatmapResponse = z.infer<typeof heatmapResponseSchema>;
export type HeatmapCellTuple = z.infer<typeof heatmapCellSchema>;
