import { z } from 'zod';
import { routeActivitySchema } from './Routes.zod.ts';

export const segmentsIdSchema = z.string();

export const segmentsSchema = z.object({
  id: segmentsIdSchema,
  user_id: z.string(),
  name: z.string().nullable(),
  activity: routeActivitySchema,
  length_m: z.number(),
  points: z.unknown(),
  min_lat: z.number(),
  min_lon: z.number(),
  max_lat: z.number(),
  max_lon: z.number(),
  source_route_id: z.string().nullable(),
  source_exercise_entry_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const segmentsInitializerSchema = z.object({
  id: segmentsIdSchema.optional(),
  user_id: z.string(),
  name: z.string().nullable().optional(),
  activity: routeActivitySchema.optional().default('run'),
  length_m: z.number(),
  points: z.unknown().optional(),
  min_lat: z.number(),
  min_lon: z.number(),
  max_lat: z.number(),
  max_lon: z.number(),
  source_route_id: z.string().nullable().optional(),
  source_exercise_entry_id: z.string().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const segmentsMutatorSchema = z.object({
  id: segmentsIdSchema.optional(),
  user_id: z.string().optional(),
  name: z.string().nullable().optional(),
  activity: routeActivitySchema.optional(),
  length_m: z.number().optional(),
  points: z.unknown().optional(),
  min_lat: z.number().optional(),
  min_lon: z.number().optional(),
  max_lat: z.number().optional(),
  max_lon: z.number().optional(),
  source_route_id: z.string().nullable().optional(),
  source_exercise_entry_id: z.string().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Segments = z.infer<typeof segmentsSchema>;
export type SegmentsInitializer = z.infer<typeof segmentsInitializerSchema>;
export type SegmentsMutator = z.infer<typeof segmentsMutatorSchema>;
