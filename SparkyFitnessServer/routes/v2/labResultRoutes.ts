import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createLabMarkerBodySchema,
  createLabResultBodySchema,
  labResultListQuerySchema,
  updateLabMarkerBodySchema,
  updateLabResultBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  createLabMarker,
  createLabResult,
  deleteLabMarker,
  deleteLabResult,
  getLabResultById,
  listLabMarkers,
  listLabResults,
  listLatestLabResults,
  updateLabMarker,
  updateLabResult,
} from '../../models/labResultRepository.js';

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

// GET /api/v2/lab-results/markers
router.get('/markers', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    res.json(await listLabMarkers(targetUserId, authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

// POST /api/v2/lab-results/markers
router.post('/markers', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = createLabMarkerBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createLabMarker(
      targetUserId,
      parsed.data,
      authenticatedUserId
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v2/lab-results/markers/:id
router.put('/markers/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab marker not found' });
    }
    const parsed = updateLabMarkerBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateLabMarker(
      targetUserId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated)
      return res.status(404).json({ error: 'Lab marker not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v2/lab-results/markers/:id (also deletes the marker's results)
router.delete('/markers/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab marker not found' });
    }
    const deleted = await deleteLabMarker(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted)
      return res.status(404).json({ error: 'Lab marker not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/v2/lab-results/latest: the newest result of every marker
router.get('/latest', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    res.json(await listLatestLabResults(targetUserId, authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

// GET /api/v2/lab-results/entries?markerKey=|markerId=&startDate=&endDate=&limit=
router.get('/entries', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = labResultListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid query', details: parsed.error.format() });
    }
    res.json(
      await listLabResults(targetUserId, parsed.data, authenticatedUserId)
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/v2/lab-results/entries/:id
router.get('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const found = await getLabResultById(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!found) return res.status(404).json({ error: 'Lab result not found' });
    res.json(found);
  } catch (error) {
    next(error);
  }
});

// POST /api/v2/lab-results/entries
router.post('/entries', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = createLabResultBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createLabResult(
      targetUserId,
      parsed.data,
      authenticatedUserId
    );
    if (!created) {
      return res.status(400).json({ error: 'Unknown custom_marker_id' });
    }
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v2/lab-results/entries/:id
router.put('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const parsed = updateLabResultBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateLabResult(
      targetUserId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated)
      return res.status(404).json({ error: 'Lab result not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v2/lab-results/entries/:id
router.delete('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const deleted = await deleteLabResult(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted)
      return res.status(404).json({ error: 'Lab result not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
