import type {
  CoachCheckinSettings,
  CoachMessage,
  UpdateCoachCheckinSettingsBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Coach check-ins API';

export const fetchCoachCheckinSettings = (): Promise<CoachCheckinSettings> =>
  apiFetch<CoachCheckinSettings>({
    endpoint: '/api/v2/coach-checkins/settings',
    serviceName: SERVICE,
    operation: 'fetch check-in settings',
  });

export const saveCoachCheckinSettings = (
  data: UpdateCoachCheckinSettingsBody
): Promise<CoachCheckinSettings> =>
  apiFetch<CoachCheckinSettings>({
    endpoint: '/api/v2/coach-checkins/settings',
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'save check-in settings',
  });

/** The messages not yet dismissed, newest first. */
export const fetchCoachMessages = (): Promise<CoachMessage[]> =>
  apiFetch<CoachMessage[]>({
    endpoint: '/api/v2/coach-checkins/messages',
    serviceName: SERVICE,
    operation: 'fetch coach messages',
  });

export const dismissCoachMessage = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/coach-checkins/messages/${encodeURIComponent(id)}/dismiss`,
    method: 'POST',
    serviceName: SERVICE,
    operation: 'dismiss coach message',
  });

export const runCoachCheckNow = (): Promise<{ created: number }> =>
  apiFetch<{ created: number }>({
    endpoint: '/api/v2/coach-checkins/check-now',
    method: 'POST',
    serviceName: SERVICE,
    operation: 'run check-in now',
  });
