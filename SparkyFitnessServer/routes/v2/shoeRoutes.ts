import express from 'express';
import {
  assignShoeBodySchema,
  createShoeBodySchema,
  shoeStatusSchema,
  updateShoeBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  assignShoeToExerciseEntry,
  createShoe,
  deleteShoe,
  getShoeById,
  getShoes,
  updateShoe,
} from '../../models/shoeRepository.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

// GET /api/v2/shoes?status=active|retired
router.get('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    let status;
    if (req.query.status !== undefined) {
      const parsed = shoeStatusSchema.safeParse(req.query.status);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'status must be active or retired' });
      }
      status = parsed.data;
    }
    const shoes = await getShoes(req.userId, authenticatedUserId, status);
    res.json(shoes);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v2/shoes/assignments/:exerciseEntryId  { shoe_id: string | null }
// Registered before /:id so "assignments" is never read as a shoe id.
router.put('/assignments/:exerciseEntryId', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = assignShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const assigned = await assignShoeToExerciseEntry(
      req.userId,
      req.params.exerciseEntryId,
      parsed.data.shoe_id,
      authenticatedUserId
    );
    if (!assigned) {
      return res
        .status(404)
        .json({ error: 'Exercise entry or shoe not found' });
    }
    res.json(assigned);
  } catch (error) {
    next(error);
  }
});

// GET /api/v2/shoes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const shoe = await getShoeById(
      req.userId,
      req.params.id,
      authenticatedUserId
    );
    if (!shoe) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json(shoe);
  } catch (error) {
    next(error);
  }
});

// POST /api/v2/shoes
router.post('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = createShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const created = await createShoe(
      req.userId,
      parsed.data,
      authenticatedUserId
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v2/shoes/:id
router.put('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = updateShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const updated = await updateShoe(
      req.userId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v2/shoes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const deleted = await deleteShoe(
      req.userId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json({ success: true, message: 'Shoe deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
