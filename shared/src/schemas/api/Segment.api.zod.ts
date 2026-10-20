import { z } from 'zod';
import { routeActivitySchema } from '../database/Routes.zod.ts';
import { routePointSchema } from './Route.api.zod.ts';

/** The most segments one person can keep. */
export const SEGMENT_MAX_PER_USER = 500;
/** The most points a client may send to cut a segment from. */
export const SEGMENT_MAX_INPUT_POINTS = 50000;

export const segmentNameSchema = z.string().trim().min(1).max(100);

const latLonSchema = routePointSchema.pick({ lat: true, lon: true });

/** A segment as stored: a thinned line and its measured length. */
export const segmentSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  activity: routeActivitySchema,
  lengthM: z.number(),
  points: z.array(latLonSchema),
  sourceRouteId: z.string().nullable(),
  sourceExerciseEntryId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** What a list needs to show a segment: no line, plus the person's own history on it. */
export const segmentSummarySchema = segmentSchema
  .omit({ points: true })
  .extend({
    /** First point, for placing the segment on a map. */
    start: latLonSchema.nullable(),
    /** Passes found over the segment. */
    effortCount: z.number().int().min(0),
    /** Shortest time over the segment, in seconds; null before a first pass. */
    bestSeconds: z.number().nullable(),
    /** Day (`YYYY-MM-DD`) of the newest pass. */
    lastEffortDate: z.string().nullable(),
  });

/** One timed pass of an activity over a segment. */
export const segmentEffortSchema = z.object({
  entryId: z.string(),
  /** Calendar day (`YYYY-MM-DD`) of the activity. */
  date: z.string(),
  /** ISO instant the segment start was crossed. */
  startedAt: z.string(),
  elapsedSeconds: z.number().min(0),
  avgSpeedMps: z.number().min(0),
  /** The fastest of this person's efforts on the segment so far. */
  isBest: z.boolean(),
  /** Faster than every effort that came before it in time. */
  isPersonalRecord: z.boolean(),
});

export const segmentEffortsResponseSchema = z.object({
  segment: segmentSummarySchema,
  /** The segment's line, for drawing it. */
  points: z.array(latLonSchema),
  /** Newest first. */
  efforts: z.array(segmentEffortSchema),
});

/** An effort listed under the activity that made it. */
export const entrySegmentEffortSchema = segmentEffortSchema.extend({
  segmentId: z.string(),
  segmentName: z.string().nullable(),
  segmentLengthM: z.number(),
  /** Seconds the previous best was, when this is a new best; otherwise null. */
  previousBestSeconds: z.number().nullable(),
  /** This effort beat every other effort on the segment (and there was one to beat). */
  isNewPersonalBest: z.boolean(),
});

export const entrySegmentEffortsResponseSchema = z.object({
  efforts: z.array(entrySegmentEffortSchema),
});

/**
 * Create a segment from points (cut by the client from a route or an
 * activity), or from a stretch of a saved route by distance from its start.
 */
export const createSegmentFromPointsBodySchema = z.object({
  mode: z.literal('points'),
  name: segmentNameSchema.optional(),
  activity: routeActivitySchema.default('run'),
  points: z.array(latLonSchema).min(2).max(SEGMENT_MAX_INPUT_POINTS),
  sourceRouteId: z.guid().optional(),
  sourceExerciseEntryId: z.guid().optional(),
});

export const createSegmentFromRouteBodySchema = z
  .object({
    mode: z.literal('route'),
    name: segmentNameSchema.optional(),
    activity: routeActivitySchema.optional(),
    routeId: z.guid(),
    startM: z.number().min(0),
    endM: z.number().min(0),
  })
  .refine((body) => body.endM > body.startM, {
    message: 'endM must be greater than startM',
    path: ['endM'],
  });

export const createSegmentBodySchema = z.discriminatedUnion('mode', [
  createSegmentFromPointsBodySchema,
  // A refined object is a ZodPipe; the union accepts it through its inner object.
  createSegmentFromRouteBodySchema,
]);

export const updateSegmentBodySchema = z
  .object({
    /** `null` clears the name. */
    name: segmentNameSchema.nullable().optional(),
  })
  .refine((body) => body.name !== undefined, {
    message: 'Provide a name',
  });

export const matchSegmentResponseSchema = z.object({
  /** Activities read this time. */
  scanned: z.number().int().min(0),
  /** New passes found this time. */
  found: z.number().int().min(0),
  /** True when more activities still wait to be read; call again. */
  hasMore: z.boolean(),
});

export type Segment = z.infer<typeof segmentSchema>;
export type SegmentSummary = z.infer<typeof segmentSummarySchema>;
export type SegmentEffort = z.infer<typeof segmentEffortSchema>;
export type SegmentEffortsResponse = z.infer<
  typeof segmentEffortsResponseSchema
>;
export type EntrySegmentEffort = z.infer<typeof entrySegmentEffortSchema>;
export type EntrySegmentEffortsResponse = z.infer<
  typeof entrySegmentEffortsResponseSchema
>;
export type CreateSegmentBody = z.infer<typeof createSegmentBodySchema>;
export type UpdateSegmentBody = z.infer<typeof updateSegmentBodySchema>;
export type MatchSegmentResponse = z.infer<typeof matchSegmentResponseSchema>;
