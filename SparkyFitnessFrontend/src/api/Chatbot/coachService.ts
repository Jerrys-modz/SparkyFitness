import { apiCall } from '@/api/api';
import {
  coachListResponseSchema,
  coachResponseSchema,
  type CreateCoachBody,
  type UpdateCoachBody,
} from '@workspace/shared';

export const loadCoaches = async () =>
  coachListResponseSchema.parse(await apiCall('/v2/coaches'));

export const createCoach = async (body: CreateCoachBody) =>
  coachResponseSchema.parse(
    await apiCall('/v2/coaches', { method: 'POST', body })
  );

export const updateCoach = async (id: string, body: UpdateCoachBody) =>
  coachResponseSchema.parse(
    await apiCall(`/v2/coaches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
    })
  );

export const deleteCoach = async (id: string) => {
  await apiCall(`/v2/coaches/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
