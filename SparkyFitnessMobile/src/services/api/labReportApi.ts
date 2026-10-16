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
