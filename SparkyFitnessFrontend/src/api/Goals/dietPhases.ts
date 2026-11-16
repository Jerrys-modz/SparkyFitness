import { api } from '@/api/api';
import type { DietPhasesResponse, SaveDietPhasesBody } from '@workspace/shared';

export const fetchDietPhases = async (): Promise<DietPhasesResponse> => {
  return api.get('/v2/diet-phases');
};

/** Replaces the whole plan; refusals carry `code` (overlap, past_locked, invalid). */
export const saveDietPhases = async (
  body: SaveDietPhasesBody
): Promise<DietPhasesResponse> => {
  return api.put('/v2/diet-phases', { body, suppressErrorToast: true });
};
