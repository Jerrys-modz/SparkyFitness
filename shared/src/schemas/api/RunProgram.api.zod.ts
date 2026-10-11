import { z } from "zod";

export const runProgramStepSchema = z.object({
  kind: z.enum(["warmup", "work", "recovery", "cooldown"]),
  seconds: z.number().int().min(1).max(14400),
});

export const runProgramPlanSchema = z.object({
  style: z.enum(["runWalk", "fastEasy"]),
  steps: z.array(runProgramStepSchema).min(1).max(200),
});

export const runProgramWorkoutSchema = z.object({
  week: z.number().int().min(0).max(51),
  day: z.number().int().min(0).max(6),
  plan: runProgramPlanSchema,
});

export const runProgramAdjustmentSchema = z.object({
  /** ISO timestamp. */
  at: z.string(),
  summary: z.string().max(500),
  source: z.enum(["user", "assistant"]),
});
export type RunProgramAdjustment = z.infer<typeof runProgramAdjustmentSchema>;

export const runProgramResponseSchema = z.object({
  id: z.string(),
  program_id: z.string(),
  enabled: z.boolean(),
  /** Index into `workouts` of the next workout; the length when finished. */
  next_index: z.number().int().min(0),
  workouts: z.array(runProgramWorkoutSchema),
  /** Most recent last, capped by the server. */
  adjustment_log: z.array(runProgramAdjustmentSchema),
  updated_at: z.string(),
});
export type RunProgramResponse = z.infer<typeof runProgramResponseSchema>;

/** `program` is null until the person has chosen one. */
export const getRunProgramResponseSchema = z.object({
  program: runProgramResponseSchema.nullable(),
});
export type GetRunProgramResponse = z.infer<typeof getRunProgramResponseSchema>;

/**
 * Creates the person's program (seeded from the built-in one) or changes its
 * switch and place. Only fields present are changed.
 */
export const upsertRunProgramBodySchema = z.object({
  program_id: z.string().min(1).max(50),
  enabled: z.boolean().optional(),
  next_index: z.number().int().min(0).max(1000).optional(),
});
export type UpsertRunProgramBody = z.infer<typeof upsertRunProgramBodySchema>;

/** Marks workout `index` done, if it is the one due. */
export const completeRunProgramWorkoutBodySchema = z.object({
  index: z.number().int().min(0).max(1000),
  /** The program the workout belonged to; ignored if the person has switched since. */
  program_id: z.string().min(1).max(40).optional(),
});
export type CompleteRunProgramWorkoutBody = z.infer<
  typeof completeRunProgramWorkoutBodySchema
>;
