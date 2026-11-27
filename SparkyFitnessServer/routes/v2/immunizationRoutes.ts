import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createImmunizationBodySchema,
  immunizationListQuerySchema,
  updateImmunizationBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  createImmunization,
  deleteImmunization,
  getImmunizationById,
  listImmunizations,
  updateImmunization,
} from '../../models/immunizationRepository.js';

const router = express.Router();

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
