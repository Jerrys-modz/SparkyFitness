import { apiCall } from '@/api/api';
import {
  coachCheckNowResponseSchema,
  coachCheckinSettingsSchema,
  coachMessageListSchema,
  type UpdateCoachCheckinSettingsBody,
} from '@workspace/shared';

export const loadCoachCheckinSettings = async () =>
  coachCheckinSettingsSchema.parse(
    await apiCall('/v2/coach-checkins/settings')
  );

export const saveCoachCheckinSettings = async (
  body: UpdateCoachCheckinSettingsBody
) =>
  coachCheckinSettingsSchema.parse(
    await apiCall('/v2/coach-checkins/settings', { method: 'PUT', body })
  );

/** Messages not yet dismissed; a failure is shown in place, not as a toast. */
export const loadCoachMessages = async () =>
  coachMessageListSchema.parse(
    await apiCall('/v2/coach-checkins/messages', { suppressErrorToast: true })
  );

export const dismissCoachMessage = async (id: string) => {
  await apiCall(
    `/v2/coach-checkins/messages/${encodeURIComponent(id)}/dismiss`,
    { method: 'POST' }
  );
};

export const runCoachCheckNow = async () =>
  coachCheckNowResponseSchema.parse(
    await apiCall('/v2/coach-checkins/check-now', { method: 'POST' })
  );
