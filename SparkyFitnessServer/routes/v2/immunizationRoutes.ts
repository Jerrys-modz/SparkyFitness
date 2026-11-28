import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createImmunizationBodySchema,
  immunizationListQuerySchema,
  immunizationScanRequestSchema,
  importImmunizationsBodySchema,
  updateImmunizationBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { todayInZone } from '@workspace/shared';
import { resolveIsAdmin } from '../../utils/adminCheck.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { createUserRateLimiter } from '../../utils/userRateLimiter.js';
import {
  extractImmunizations,
  flagAlreadyRecorded,
  type ImmunizationScanErrorCategory,
} from '../../services/immunizationScanService.js';
import {
  createImmunization,
  deleteImmunization,
  getImmunizationById,
  importImmunizations,
  listImmunizations,
  updateImmunization,
} from '../../models/immunizationRepository.js';

const router = express.Router();

/** Each scan reads a document and calls the user's AI provider, so keep it modest. */
export const SCAN_RATE_LIMIT_MAX = 10;
export const SCAN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const immunizationScanRateLimiter = createUserRateLimiter(
  SCAN_RATE_LIMIT_MAX,
  SCAN_RATE_LIMIT_WINDOW_MS
);

const SCAN_ERROR_HTTP_STATUS: Record<ImmunizationScanErrorCategory, number> = {
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

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

const uuidSchema = z.string().uuid();

const actingUsers = (req: Request) => ({
  targetUserId: req.userId,
  authenticatedUserId: req.authenticatedUserId || req.userId,
});

const invalidBody = (res: Response, error: z.ZodError) =>
  res
    .status(400)
    .json({ error: 'Invalid request body', details: error.format() });

const notFound = (res: Response) =>
  res.status(404).json({ error: 'Immunization not found' });

/**
 * @swagger
 * /v2/immunizations/scan:
 *   post:
 *     summary: Read a vaccine record (PDF or photo) with the user's AI provider
 *     description: >
 *       Nothing is saved. The record is read in memory and the vaccines found
 *       are returned for review, each flagged when the same vaccine on the same
 *       day is already recorded. A PDF must have a text layer; a scanned PDF is
 *       rejected and should be sent as a photo instead.
 *     tags: [Wellness & Metrics]
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
 *       200: { description: The vaccines read from the record. }
 *       400: { description: Invalid request, an unsupported or unreadable photo, or a document that is too large. }
 *       429: { description: Too many scans in a short time. }
 *       403: { description: The AI provider URL is on a private network. }
 *       422: { description: No usable AI provider, an unreadable PDF, or no vaccines could be read. }
 *       502: { description: The AI provider failed. }
 *       504: { description: The AI provider timed out. }
 */
// POST /api/v2/immunizations/scan
router.post('/scan', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const body = immunizationScanRequestSchema.safeParse(req.body);
    if (!body.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: body.error.flatten() });
    }
    const retryAfter = immunizationScanRateLimiter.hit(req.userId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many scans. Try again shortly.' });
    }
    const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
    const result = await extractImmunizations(
      body.data.document,
      body.data.mime_type,
      req.userId,
      isAdmin,
      todayInZone(await loadUserTimezone(targetUserId))
    );
    if (!result.success) {
      const status = SCAN_ERROR_HTTP_STATUS[result.category] ?? 500;
      return res.status(status).json({ error: result.error });
    }
    const existing = await listImmunizations(
      targetUserId,
      { limit: 5000 },
      authenticatedUserId
    );
    res.json({ records: flagAlreadyRecorded(result.extraction, existing) });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations/imports:
 *   post:
 *     summary: Save the reviewed records of one scan
 *     tags: [Wellness & Metrics]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [records]
 *             properties:
 *               records:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 200
 *                 items:
 *                   type: object
 *                   required: [vaccine_name, administered_on]
 *     responses:
 *       201: { description: How many records were created (all or none). }
 *       400: { description: Invalid body. }
 *       403: { description: Missing check-in permission. }
 */
// POST /api/v2/immunizations/imports
router.post('/imports', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = importImmunizationsBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await importImmunizations(
      targetUserId,
      parsed.data.records,
      authenticatedUserId
    );
    res.status(201).json({ created });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations:
 *   get:
 *     summary: List immunization records, newest first
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 5000, default: 1000 }
 *     responses:
 *       200:
 *         description: Immunization records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Immunization'
 *       400:
 *         description: Invalid query
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/immunizations
router.get('/', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = immunizationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid query', details: parsed.error.format() });
    }
    res.json(
      await listImmunizations(targetUserId, parsed.data, authenticatedUserId)
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations/{id}:
 *   get:
 *     summary: Get one immunization record
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Immunization'
 *       404:
 *         description: Not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/immunizations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
    const found = await getImmunizationById(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!found) return notFound(res);
    res.json(found);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations:
 *   post:
 *     summary: Add an immunization record
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ImmunizationInput'
 *     responses:
 *       201:
 *         description: The new record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Immunization'
 *       400:
 *         description: Invalid body
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/immunizations
router.post('/', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = createImmunizationBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createImmunization(
      targetUserId,
      parsed.data,
      authenticatedUserId
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations/{id}:
 *   put:
 *     summary: Update an immunization record (send null to clear an optional field)
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ImmunizationInput'
 *     responses:
 *       200:
 *         description: The updated record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Immunization'
 *       400:
 *         description: Invalid body
 *       404:
 *         description: Not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/immunizations/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
    const parsed = updateImmunizationBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateImmunization(
      targetUserId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated) return notFound(res);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/immunizations/{id}:
 *   delete:
 *     summary: Delete an immunization record
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/immunizations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
    const deleted = await deleteImmunization(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted) return notFound(res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
