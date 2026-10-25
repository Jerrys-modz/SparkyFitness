import express from 'express';
import { z } from 'zod';
import {
  createCalorieMaintenancePeriodBodySchema,
  listCalorieMaintenancePeriodsQuerySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import calorieMaintenancePeriodRepository from '../../models/calorieMaintenancePeriodRepository.js';

/**
 * Refeed days and diet breaks: days whose calorie target is worked out with
 * Goal Mode set to Maintain. They shape the daily calorie goal, so they follow
 * the goals' permission (`diary`).
 */
const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

/**
 * @swagger
 * /v2/calorie-maintenance-periods:
 *   get:
 *     summary: List refeed days and diet breaks
 *     tags: [Goals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: The periods that touch the range, oldest first.
 *       400:
 *         description: Invalid query.
 *   post:
 *     summary: Add a refeed day or a diet break
 *     description: On these days the calorie target is worked out with Goal Mode set to Maintain. A refeed is one day; a diet break is at most 28 days.
 *     tags: [Goals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The new period.
 *       400:
 *         description: Invalid body.
 */
router.get('/', async (req, res, next) => {
  try {
    const query = listCalorieMaintenancePeriodsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.format(),
      });
    }
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const periods =
      await calorieMaintenancePeriodRepository.getCalorieMaintenancePeriods(
        req.userId,
        authenticatedUserId,
        query.data.from,
        query.data.to
      );
    res.json({ periods });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = createCalorieMaintenancePeriodBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: body.error.format(),
      });
    }
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const period =
      await calorieMaintenancePeriodRepository.createCalorieMaintenancePeriod(
        req.userId,
        authenticatedUserId,
        body.data
      );
    res.status(201).json(period);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/calorie-maintenance-periods/{id}:
 *   delete:
 *     summary: Remove a refeed day or diet break
 *     tags: [Goals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Removed.
 *       404:
 *         description: No such period.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const removed =
      await calorieMaintenancePeriodRepository.deleteCalorieMaintenancePeriod(
        req.userId,
        authenticatedUserId,
        id.data
      );
    if (!removed) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
