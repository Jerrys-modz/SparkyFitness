import { apiCall } from '@/api/api';
import type {
  CreateImmunizationBody,
  ImmunizationResponse,
  ImmunizationScanResponse,
  ImportImmunizationsBody,
  ImportImmunizationsResponse,
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

/** Reads a vaccine record. Nothing is saved; the vaccines come back for review. */
export const scanImmunizations = (
  document: string,
  mimeType: string
): Promise<ImmunizationScanResponse> =>
  apiCall('/v2/immunizations/scan', {
    method: 'POST',
    body: { document, mime_type: mimeType },
    // The import dialog reports a failure inline for the current file only.
    suppressErrorToast: true,
  });

export const importImmunizations = (
  body: ImportImmunizationsBody
): Promise<ImportImmunizationsResponse> =>
  apiCall('/v2/immunizations/imports', { method: 'POST', body });
