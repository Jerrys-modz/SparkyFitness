import express, { RequestHandler } from 'express';
import { z } from 'zod';
import { labReportScanRequestSchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../../utils/adminCheck.js';
import {
  deleteImportedLabResults,
  deleteLabMarkerWithResults,
} from '../../models/labResultRepository.js';
import {
  extractLabReport,
  matchLabReportResults,
  type LabReportScanErrorCategory,
} from '../../services/labReportScanService.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

/**
 * @swagger
 * /v2/lab-reports/scan:
 *   post:
 *     summary: Read a lab report (PDF or photo) with the user's AI provider
 *     description: >
 *       Nothing is saved. The report is read in memory and the results are
 *       returned for the user to review. A PDF must have a text layer; a scanned
 *       PDF is rejected and should be sent as a photo instead.
 *     tags: [Check-in]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [document, mime_type]
 *             properties:
 *               document: { type: string, description: Base64-encoded PDF or image }
 *               mime_type: { type: string, example: application/pdf }
 *     responses:
 *       200: { description: The results read from the report, each matched to a known marker where possible. }
 *       400: { description: Invalid request, an unsupported image type, or a document that is too large. }
 *       403: { description: The AI provider URL is on a private network. }
 *       422: { description: No usable AI provider, an unreadable PDF, or the model did not return readable results. }
 *       502: { description: The AI provider failed. }
 *       504: { description: The AI provider timed out. }
 */

const LAB_REPORT_ERROR_HTTP_STATUS: Record<LabReportScanErrorCategory, number> =
  {
    no_ai_configured: 422,
    unsupported_provider: 422,
    api_key_missing: 422,
    custom_url_missing: 422,
    private_network_forbidden: 403,
    unsupported_media: 400,
    image_too_large: 400,
    document_too_large: 400,
    unreadable_pdf: 422,
    refused: 422,
    truncated: 422,
    no_content: 422,
    parse_error: 422,
    upstream_error: 502,
    timeout: 504,
  };

const scanLabReport: RequestHandler = async (req, res, next) => {
  try {
    const body = labReportScanRequestSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.flatten(),
      });
    }
    const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
    const result = await extractLabReport(
      body.data.document,
      body.data.mime_type,
      req.userId,
      isAdmin
    );
    if (!result.success) {
      const status = LAB_REPORT_ERROR_HTTP_STATUS[result.category] ?? 500;
      return res.status(status).json({ error: result.error });
    }
    res.json({
      report: {
        lab_name: result.report.lab_name,
        collected_on: result.report.collected_on,
        results: matchLabReportResults(result.report),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v2/lab-reports/imports:
 *   delete:
 *     summary: Delete the lab results saved by report imports
 *     description: >
 *       Removes every result that has an import id (or one import's results with
 *       `import_id`), then the lab markers left with no results. Results typed in
 *       by hand are not touched.
 *     tags: [Check-in]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: import_id, required: false, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "How many results and markers were deleted." }
 *       400: { description: Invalid import_id. }
 * /v2/lab-reports/markers/{categoryId}:
 *   delete:
 *     summary: Delete a lab marker and all of its results
 *     tags: [Check-in]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The marker and its results were deleted. }
 *       404: { description: Not one of the user's lab markers. }
 */
const importIdQuerySchema = z.object({
  import_id: z.string().uuid().optional(),
});

const deleteImports: RequestHandler = async (req, res, next) => {
  try {
    const query = importIdQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: 'import_id must be a UUID' });
    }
    const outcome = await deleteImportedLabResults(
      req.userId,
      query.data.import_id
    );
    res.json(outcome);
  } catch (error) {
    next(error);
  }
};

const deleteMarker: RequestHandler = async (req, res, next) => {
  try {
    const params = z
      .object({ categoryId: z.string().uuid() })
      .safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'categoryId must be a UUID' });
    }
    const outcome = await deleteLabMarkerWithResults(
      req.userId,
      params.data.categoryId
    );
    if (!outcome) {
      return res.status(404).json({ error: 'Lab marker not found' });
    }
    res.json(outcome);
  } catch (error) {
    next(error);
  }
};

router.post('/scan', scanLabReport);
router.delete('/imports', deleteImports);
router.delete('/markers/:categoryId', deleteMarker);

export default router;
