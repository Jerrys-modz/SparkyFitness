import type { LabReportScanResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';
import { AI_TIMEOUT_MS } from '../../utils/concurrency';

/**
 * Reads a lab report (a PDF with a text layer, or a photo) with the user's AI
 * provider. Nothing is saved; the results come back for review.
 * POST /api/v2/lab-reports/scan
 */
export const scanLabReport = (
  document: string,
  mimeType: string
): Promise<LabReportScanResponse> =>
  apiFetch<LabReportScanResponse>({
    endpoint: '/api/v2/lab-reports/scan',
    serviceName: 'Lab Reports API',
    operation: 'scan lab report',
    method: 'POST',
    body: { document, mime_type: mimeType },
    timeoutMs: AI_TIMEOUT_MS,
  });

export interface DeleteImportedLabResultsResponse {
  /** Results removed. */
  results: number;
  /** Lab markers removed because nothing was left in them. */
  markers: number;
}

/**
 * Deletes every result a report import saved, then the lab markers left empty.
 * Results typed in by hand are kept. DELETE /api/v2/lab-reports/imports
 */
export const deleteImportedLabResults =
  (): Promise<DeleteImportedLabResultsResponse> =>
    apiFetch<DeleteImportedLabResultsResponse>({
      endpoint: '/api/v2/lab-reports/imports',
      serviceName: 'Lab Reports API',
      operation: 'delete imported lab results',
      method: 'DELETE',
    });

/**
 * Deletes one lab marker and all of its results.
 * DELETE /api/v2/lab-reports/markers/:categoryId
 */
export const deleteLabMarker = (
  categoryId: string
): Promise<{ results: number }> =>
  apiFetch<{ results: number }>({
    endpoint: `/api/v2/lab-reports/markers/${encodeURIComponent(categoryId)}`,
    serviceName: 'Lab Reports API',
    operation: 'delete lab marker',
    method: 'DELETE',
  });
