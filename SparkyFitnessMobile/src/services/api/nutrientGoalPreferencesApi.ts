import type {
  NutrientGoalPreferencesResponse,
  UpsertNutrientGoalPreferenceRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export type NutrientGoalType = UpsertNutrientGoalPreferenceRequest['goalType'];

/**
 * Fetches the effective goal direction for every nutrient (saved overrides
 * merged with built-in defaults).
 * GET /api/nutrient-goal-preferences
 */
export const fetchNutrientGoalPreferences =
  (): Promise<NutrientGoalPreferencesResponse> =>
    apiFetch<NutrientGoalPreferencesResponse>({
      endpoint: '/api/nutrient-goal-preferences',
      serviceName: 'Nutrient Goal Preferences API',
      operation: 'fetch nutrient goal preferences',
    });

/**
 * Saves the goal direction for one nutrient. `target` requires both bounds.
 * PUT /api/nutrient-goal-preferences/:nutrientKey
 */
export const updateNutrientGoalPreference = (
  nutrientKey: string,
  data: UpsertNutrientGoalPreferenceRequest
): Promise<unknown> =>
  apiFetch<unknown>({
    endpoint: `/api/nutrient-goal-preferences/${encodeURIComponent(nutrientKey)}`,
    serviceName: 'Nutrient Goal Preferences API',
    operation: 'update nutrient goal preference',
    method: 'PUT',
    body: data,
  });

/**
 * Removes the override for one nutrient, restoring its built-in direction.
 * DELETE /api/nutrient-goal-preferences/:nutrientKey
 */
export const resetNutrientGoalPreference = (
  nutrientKey: string
): Promise<unknown> =>
  apiFetch<unknown>({
    endpoint: `/api/nutrient-goal-preferences/${encodeURIComponent(nutrientKey)}`,
    serviceName: 'Nutrient Goal Preferences API',
    operation: 'reset nutrient goal preference',
    method: 'DELETE',
  });
