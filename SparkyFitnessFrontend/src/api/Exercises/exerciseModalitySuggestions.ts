import { apiCall } from '@/api/api';
import type {
  ExerciseModality,
  ExerciseModalitySuggestion,
} from '@workspace/shared';

/** The user's own exercises whose detected tracking type differs from the stored one. */
export const getModalitySuggestions = async (): Promise<
  ExerciseModalitySuggestion[]
> => {
  const data = await apiCall('/exercises/modality-suggestions', {
    method: 'GET',
  });
  return Array.isArray(data) ? (data as ExerciseModalitySuggestion[]) : [];
};

export const applyModalitySuggestions = async (
  changes: { id: string; modality: ExerciseModality }[]
): Promise<{ updated: number }> => {
  return apiCall('/exercises/modality-suggestions/apply', {
    method: 'POST',
    body: JSON.stringify({ changes }),
  });
};
