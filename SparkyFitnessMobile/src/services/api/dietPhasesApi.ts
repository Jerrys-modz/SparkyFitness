import type {
  DietPhaseErrorCode,
  DietPhasesResponse,
  SaveDietPhasesBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';

const SERVICE = 'Diet Phases API';

/** The diet phase plan in start order, with today's status. */
export const fetchDietPhases = (): Promise<DietPhasesResponse> =>
  apiFetch<DietPhasesResponse>({
    endpoint: '/api/v2/diet-phases',
    serviceName: SERVICE,
    operation: 'fetch diet phases',
  });

/** Replaces the whole plan; phases not sent are removed. */
export const saveDietPhases = (
  body: SaveDietPhasesBody
): Promise<DietPhasesResponse> =>
  apiFetch<DietPhasesResponse>({
    endpoint: '/api/v2/diet-phases',
    serviceName: SERVICE,
    operation: 'save diet phases',
    method: 'PUT',
    body,
  });

/** The server's reason for refusing a plan (400 `code`), if it gave one. */
export function dietPhaseErrorCode(error: unknown): DietPhaseErrorCode | null {
  if (!(error instanceof ApiError) || !error.body) return null;
  try {
    const parsed: unknown = JSON.parse(error.body);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      (parsed.code === 'overlap' ||
        parsed.code === 'past_locked' ||
        parsed.code === 'invalid')
    ) {
      return parsed.code;
    }
  } catch {
    // Not JSON: no code.
  }
  return null;
}
