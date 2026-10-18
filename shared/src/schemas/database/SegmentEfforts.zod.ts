import { z } from "zod";

export const segmentEffortsIdSchema = z.string();

// A row with null `started_at` / `elapsed_seconds` / `avg_speed_mps` records
// that the activity was scanned and has no valid pass over the segment.
export const segmentEffortsSchema = z.object({
  id: segmentEffortsIdSchema,
  user_id: z.string(),
  segment_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  started_at: z.coerce.date().nullable(),
  elapsed_seconds: z.number().nullable(),
  avg_speed_mps: z.number().nullable(),
  created_at: z.coerce.date(),
});

export const segmentEffortsInitializerSchema = z.object({
  id: segmentEffortsIdSchema.optional(),
  user_id: z.string(),
  segment_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  started_at: z.coerce.date().nullable().optional(),
  elapsed_seconds: z.number().nullable().optional(),
  avg_speed_mps: z.number().nullable().optional(),
  created_at: z.coerce.date().optional(),
});

export const segmentEffortsMutatorSchema = z.object({
  id: segmentEffortsIdSchema.optional(),
  user_id: z.string().optional(),
  segment_id: z.string().optional(),
  exercise_entry_id: z.string().optional(),
  entry_date: z.string().optional(),
  started_at: z.coerce.date().nullable().optional(),
  elapsed_seconds: z.number().nullable().optional(),
  avg_speed_mps: z.number().nullable().optional(),
  created_at: z.coerce.date().optional(),
});

export type SegmentEfforts = z.infer<typeof segmentEffortsSchema>;
export type SegmentEffortsInitializer = z.infer<
  typeof segmentEffortsInitializerSchema
>;
export type SegmentEffortsMutator = z.infer<typeof segmentEffortsMutatorSchema>;
