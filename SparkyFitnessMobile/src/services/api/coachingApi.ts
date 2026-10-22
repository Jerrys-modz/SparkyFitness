import type {
  CoachingCheckInResponse,
  CoachingSettings,
  CoachingTargets,
  UpdateCoachingSettingsBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export const fetchCoachingCheckIn = (): Promise<CoachingCheckInResponse> =>
  apiFetch<CoachingCheckInResponse>({
    endpoint: '/api/reports/coaching-checkin',
    serviceName: 'Coaching API',
    operation: 'fetch coaching check-in',
  });

export const saveCoachingSettings = (
  body: UpdateCoachingSettingsBody
): Promise<CoachingSettings> =>
  apiFetch<CoachingSettings>({
    endpoint: '/api/goals/coaching-settings',
    serviceName: 'Coaching API',
    operation: 'save coaching settings',
    method: 'PUT',
    body,
  });

export const acceptCoachingCheckIn = (
  calories: number
): Promise<CoachingTargets> =>
  apiFetch<CoachingTargets>({
    endpoint: '/api/goals/coaching-checkin/accept',
    serviceName: 'Coaching API',
    operation: 'accept coaching check-in',
    method: 'POST',
    body: { calories },
  });
