import { z } from "zod";
import {
  routeActivitySchema,
  routeSourceSchema,
} from "../database/Routes.zod.ts";

/** The most points a client may send; the server simplifies to far fewer. */
export const ROUTE_MAX_INPUT_POINTS = 50000;
/** The most points a stored route keeps. */
export const ROUTE_MAX_STORED_POINTS = 2000;
/** The most routes one person can keep. */
export const ROUTE_MAX_PER_USER = 200;
/** The largest GPX file (characters) the import endpoint accepts. */
export const ROUTE_MAX_GPX_CHARS = 10_000_000;

export const routePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Altitude in metres. */
  alt: z.number().min(-1000).max(10000).optional(),
});

/**
 * A turn instruction. `index` is the point in `points` where it applies, so a
 * device can fire the cue when it gets close to that point.
 */
export const routeCueKindSchema = z.enum([
  "depart",
  "straight",
  "slight_left",
  "left",
  "sharp_left",
  "slight_right",
  "right",
  "sharp_right",
  "uturn",
  "arrive",
]);

export const routeCueSchema = z.object({
  index: z.number().int().min(0),
  kind: routeCueKindSchema,
  text: z.string().trim().max(120).optional(),
  /** Metres from the start of the route to this cue. */
  distanceM: z.number().min(0).optional(),
});

export const routeNameSchema = z.string().trim().min(1).max(100);

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  activity: routeActivitySchema,
  source: routeSourceSchema,
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  points: z.array(routePointSchema),
  cues: z.array(routeCueSchema),
  sourceExerciseEntryId: z.string().nullable(),
  /** Diary entries that followed this route. */
  runCount: z.number().int().min(0),
  /** Shortest logged time over the route, in seconds; null before a first run. */
  bestDurationSeconds: z.number().int().nullable(),
  /** Day (`YYYY-MM-DD`) of the newest run; null before a first run. */
  lastRunDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** One diary entry that followed a route, as listed under the route. */
export const routeRunSchema = z.object({
  entryId: z.string(),
  /** Calendar day (`YYYY-MM-DD`). */
  date: z.string(),
  durationSeconds: z.number().int().min(0),
  distanceM: z.number().nullable(),
  /** Seconds per kilometre; null when the entry has no distance. */
  paceSecPerKm: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
});

export const routeRunsResponseSchema = z.object({
  runs: z.array(routeRunSchema),
});

/** Metres of route between two ghost times. */
export const ROUTE_GHOST_INTERVAL_M = 100;

/**
 * The best run over a route as a pace line: `splits[i]` is the active seconds
 * the best run had spent when it reached `min((i + 1) * intervalM, route length)`
 * metres along the route, so the last entry is its total time.
 */
export const routeGhostSchema = z.object({
  entryId: z.string(),
  durationSeconds: z.number().int().min(1),
  intervalM: z.number().int().min(1),
  splits: z.array(z.number().int().min(0)),
  /** `track` is read off the run's own GPS timeline; `constant_pace` is an even pace over its total time. */
  source: z.enum(["track", "constant_pace"]),
});

/** `ghost` is null while the route has no timed run. */
export const routeGhostResponseSchema = z.object({
  ghost: routeGhostSchema.nullable(),
});

/** Links an exercise entry to a route, or clears the link with `null`. */
export const attachEntryRouteBodySchema = z.object({
  routeId: z.guid().nullable(),
});

/** A route in a list: everything but the (large) points and cues. */
export const routeSummarySchema = routeSchema
  .omit({ points: true, cues: true })
  .extend({
    /** First point, for placing the route on a map. */
    start: routePointSchema.nullable(),
    pointCount: z.number().int(),
  });

export const createRouteBodySchema = z.object({
  name: routeNameSchema,
  activity: routeActivitySchema.default("run"),
  points: z.array(routePointSchema).min(2).max(ROUTE_MAX_INPUT_POINTS),
  cues: z.array(routeCueSchema).max(1000).optional(),
});

export const updateRouteBodySchema = z
  .object({
    name: routeNameSchema.optional(),
    activity: routeActivitySchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.activity !== undefined, {
    message: "Provide a name or an activity",
  });

export const importGpxRouteBodySchema = z.object({
  gpx: z.string().min(1).max(ROUTE_MAX_GPX_CHARS),
  /** Overrides the name found in the file. */
  name: routeNameSchema.optional(),
  activity: routeActivitySchema.default("run"),
});

export const routeFromActivityBodySchema = z.object({
  name: routeNameSchema.optional(),
  activity: routeActivitySchema.optional(),
});

export type RoutePoint = z.infer<typeof routePointSchema>;
export type RouteCueKind = z.infer<typeof routeCueKindSchema>;
export type RouteCue = z.infer<typeof routeCueSchema>;
export type Route = z.infer<typeof routeSchema>;
export type RouteSummary = z.infer<typeof routeSummarySchema>;
export type RouteRun = z.infer<typeof routeRunSchema>;
export type RouteGhost = z.infer<typeof routeGhostSchema>;
export type RouteGhostResponse = z.infer<typeof routeGhostResponseSchema>;
export type RouteRunsResponse = z.infer<typeof routeRunsResponseSchema>;
export type AttachEntryRouteBody = z.infer<typeof attachEntryRouteBodySchema>;
export type CreateRouteBody = z.infer<typeof createRouteBodySchema>;
export type UpdateRouteBody = z.infer<typeof updateRouteBodySchema>;
export type ImportGpxRouteBody = z.infer<typeof importGpxRouteBodySchema>;
export type RouteFromActivityBody = z.infer<typeof routeFromActivityBodySchema>;
