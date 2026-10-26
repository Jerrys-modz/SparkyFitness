import type {
  ImportWorkoutSplitRequest,
  ImportWorkoutSplitResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

/**
 * Makes the person's own copy of a built-in split: its exercises are added to
 * the library, each session becomes a preset and the sessions become a
 * sequential plan.
 */
export const importWorkoutSplit = (
  splitId: string,
  body: ImportWorkoutSplitRequest
): Promise<ImportWorkoutSplitResponse> =>
  apiFetch<ImportWorkoutSplitResponse>({
    endpoint: `/api/v2/workout-splits/${encodeURIComponent(splitId)}/import`,
    serviceName: 'Workout Splits API',
    operation: 'import workout split',
    method: 'POST',
    body,
  });
