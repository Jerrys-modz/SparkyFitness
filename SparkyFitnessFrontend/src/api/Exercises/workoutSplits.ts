import { apiCall } from '@/api/api';
import type {
  ImportWorkoutSplitRequest,
  ImportWorkoutSplitResponse,
} from '@workspace/shared';

/**
 * Makes the person's own copy of a built-in split: its exercises are added to
 * the library, each session becomes a preset and the sessions become a
 * sequential plan.
 */
export const importWorkoutSplit = (
  splitId: string,
  body: ImportWorkoutSplitRequest
): Promise<ImportWorkoutSplitResponse> =>
  apiCall(`/v2/workout-splits/${encodeURIComponent(splitId)}/import`, {
    method: 'POST',
    body,
  });
