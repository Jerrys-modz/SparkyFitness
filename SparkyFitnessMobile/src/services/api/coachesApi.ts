import type {
  CoachResponse,
  CreateCoachBody,
  UpdateCoachBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Coaches API';

/** The person's own coaches; the built-in ones are shared constants. */
export const fetchCoaches = (): Promise<CoachResponse[]> =>
  apiFetch<CoachResponse[]>({
    endpoint: '/api/v2/coaches',
    serviceName: SERVICE,
    operation: 'fetch coaches',
  });

export const createCoach = (data: CreateCoachBody): Promise<CoachResponse> =>
  apiFetch<CoachResponse>({
    endpoint: '/api/v2/coaches',
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'create coach',
  });

export const updateCoach = (
  id: string,
  data: UpdateCoachBody
): Promise<CoachResponse> =>
  apiFetch<CoachResponse>({
    endpoint: `/api/v2/coaches/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body: data,
    serviceName: SERVICE,
    operation: 'update coach',
  });

export const deleteCoach = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/coaches/${encodeURIComponent(id)}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete coach',
  });
