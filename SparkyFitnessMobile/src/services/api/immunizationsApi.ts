import type {
  CreateImmunizationBody,
  ImmunizationResponse,
  UpdateImmunizationBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Immunizations API';

export const fetchImmunizations = (): Promise<ImmunizationResponse[]> =>
  apiFetch<ImmunizationResponse[]>({
    endpoint: '/api/v2/immunizations',
    serviceName: SERVICE,
    operation: 'fetch immunizations',
  });

export const createImmunization = (
  body: CreateImmunizationBody
): Promise<ImmunizationResponse> =>
  apiFetch<ImmunizationResponse>({
    endpoint: '/api/v2/immunizations',
    serviceName: SERVICE,
    operation: 'create immunization',
    method: 'POST',
    body,
  });

export const updateImmunization = (
  id: string,
  body: UpdateImmunizationBody
): Promise<ImmunizationResponse> =>
  apiFetch<ImmunizationResponse>({
    endpoint: `/api/v2/immunizations/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update immunization',
    method: 'PUT',
    body,
  });

export const deleteImmunization = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/immunizations/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete immunization',
    method: 'DELETE',
  });
