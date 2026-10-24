import { z } from 'zod';
import { BEST_EFFORT_IDS } from '../../utils/bestEfforts.ts';

export const bestEffortIdSchema = z.enum(BEST_EFFORT_IDS);

/** The fastest stretch of one distance found inside any of the person's runs. */
export const bestEffortBoardItemSchema = z.object({
  id: bestEffortIdSchema,
  distanceMeters: z.number(),
  seconds: z.number(),
  activityId: z.string(),
  activityName: z.string(),
  /** YYYY-MM-DD of the run the stretch came from. */
  achievedAt: z.string(),
  /** Where the stretch sits in that run, in metres from its start. */
  startMeters: z.number(),
  endMeters: z.number(),
});
export type BestEffortBoardItem = z.infer<typeof bestEffortBoardItemSchema>;

export const bestEffortsResponseSchema = z.object({
  /** One item per distance, shortest first; a distance no run reaches is absent. */
  efforts: z.array(bestEffortBoardItemSchema),
  /** Runs with a stored track or distance series that were searched. */
  runsAnalyzed: z.number(),
  /** True when more runs exist than the server searches in one request. */
  truncated: z.boolean(),
});
export type BestEffortsResponse = z.infer<typeof bestEffortsResponseSchema>;
