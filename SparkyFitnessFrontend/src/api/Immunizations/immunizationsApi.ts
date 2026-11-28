import { apiCall } from '@/api/api';
import type {
  CreateImmunizationBody,
  ImmunizationResponse,
  UpdateImmunizationBody,
} from '@workspace/shared';

export const listImmunizations = (): Promise<ImmunizationResponse[]> =>
  apiCall('/v2/immunizations', { method: 'GET' });

export const createImmunization = (
  body: CreateImmunizationBody
): Promise<ImmunizationResponse> =>
  apiCall('/v2/immunizations', { method: 'POST', body });

export const updateImmunization = (
  id: string,
  body: UpdateImmunizationBody
): Promise<ImmunizationResponse> =>
  apiCall(`/v2/immunizations/${id}`, { method: 'PUT', body });

export const deleteImmunization = (id: string): Promise<void> =>
  apiCall(`/v2/immunizations/${id}`, { method: 'DELETE' });
