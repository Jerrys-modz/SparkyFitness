import { z } from 'zod';

/**
 * Records a phone imported from its health store (Apple Health, Health
 * Connect) that were later deleted there. The phone sends the deleted
 * samples' ids and the server removes the rows it imported under the same
 * (user, source, source_id). An id the server never stored is ignored.
 *
 * Only types whose imported rows are keyed by the store's own sample id can
 * be deleted this way; water is the first.
 */
export const HEALTH_DATA_DELETION_TYPES = ['water'] as const;
export type HealthDataDeletionType =
  (typeof HEALTH_DATA_DELETION_TYPES)[number];

/** Most ids one request may carry. */
export const HEALTH_DATA_DELETIONS_MAX_IDS = 5_000;

export const healthDataDeletionsRequestSchema = z.object({
  type: z.enum(HEALTH_DATA_DELETION_TYPES),
  source: z.string().trim().min(1).max(100),
  source_ids: z
    .array(z.string().trim().min(1).max(255))
    .min(1)
    .max(HEALTH_DATA_DELETIONS_MAX_IDS),
});
export type HealthDataDeletionsRequest = z.infer<
  typeof healthDataDeletionsRequestSchema
>;

export const healthDataDeletionsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
});
export type HealthDataDeletionsResponse = z.infer<
  typeof healthDataDeletionsResponseSchema
>;
