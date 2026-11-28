import type {
  CreateImmunizationBody,
  ImmunizationResponse,
  ImmunizationScanResponse,
  ImportImmunizationsBody,
  ImportImmunizationsResponse,
  UpdateImmunizationBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { putCacheRows } from '../../offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../offline/collections';
import { readSavedSingle } from '../../offline/foodLibrary';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import { AI_TIMEOUT_MS } from '../../utils/concurrency';

const SERVICE = 'Immunizations API';

/**
 * The person's records, newest first. With no connection the copy the phone
 * kept from the last answer is used (#1983), so the list and the reminders
 * still work offline.
 */
export const fetchImmunizations = (): Promise<ImmunizationResponse[]> =>
  withOfflineFallback<ImmunizationResponse[]>({
    fetch: () =>
      apiFetch<ImmunizationResponse[]>({
        endpoint: '/api/v2/immunizations',
        serviceName: SERVICE,
        operation: 'fetch immunizations',
      }),
    store: (db, serverConfigId, records) =>
      putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.immunizations, [
        { key: SINGLE_DOCUMENT_KEY, payload: records },
      ]),
    read: (db, serverConfigId) =>
      readSavedSingle<ImmunizationResponse[]>(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.immunizations
      ),
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

/**
 * Reads a vaccine record (a PDF with a text layer, or a photo) with the user's
 * AI provider. Nothing is saved; the vaccines come back for review.
 * POST /api/v2/immunizations/scan
 */
export const scanImmunizations = (
  document: string,
  mimeType: string
): Promise<ImmunizationScanResponse> =>
  apiFetch<ImmunizationScanResponse>({
    endpoint: '/api/v2/immunizations/scan',
    serviceName: SERVICE,
    operation: 'scan immunizations',
    method: 'POST',
    body: { document, mime_type: mimeType },
    timeoutMs: AI_TIMEOUT_MS,
    // The request is a health record, so an error body that quotes it stays out of the log.
    logResponseBody: false,
  });

/**
 * Saves the reviewed vaccines of one scan, all or none.
 * POST /api/v2/immunizations/imports
 */
export const importImmunizations = (
  body: ImportImmunizationsBody
): Promise<ImportImmunizationsResponse> =>
  apiFetch<ImportImmunizationsResponse>({
    endpoint: '/api/v2/immunizations/imports',
    serviceName: SERVICE,
    operation: 'import immunizations',
    method: 'POST',
    body,
    logResponseBody: false,
  });
