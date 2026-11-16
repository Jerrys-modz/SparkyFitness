import express from 'express';
import { saveDietPhasesBodySchema } from '@workspace/shared';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  DietPhaseValidationError,
  getDietPhaseOverview,
  saveDietPhases,
} from '../../services/dietPhaseService.js';

/**
 * Diet phases: a dated plan (cut -> maintain -> cut) that sets Goal Mode and
 * its weekly rate per day. Reading follows the diary read permission, like
 * goals; only the owner changes the plan, like Goal Mode itself.
 */
const router = express.Router();

/**
 * @swagger
 * /v2/diet-phases:
 *   get:
 *     summary: Get the diet phase plan
 *     description: Returns every phase in start order, each with its actual last day, plus the current phase, days left, the next phase and whether a change is near.
 *     tags: [Goals]
 *     responses:
 *       200:
 *         description: The plan and today's status.
 *   put:
 *     summary: Replace the diet phase plan
 *     description: The whole plan; phases sent with an id are kept, others are added and missing ones removed. Overlapping phases and changes to any day before today are refused. Owner only.
 *     tags: [Goals]
 *     responses:
 *       200:
 *         description: The saved plan and today's status.
 *       400:
 *         description: Invalid plan (code invalid, overlap or past_locked).
 *       403:
 *         description: Not the owner.
 */
router.get('/', checkPermissionMiddleware('diary'), async (req, res, next) => {
  try {
    res.json(await getDietPhaseOverview(req.userId, req.authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

router.put('/', requireSelfActor, async (req, res, next) => {
  try {
    const parsed = saveDietPhasesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        code: 'invalid',
        details: parsed.error.format(),
      });
    }
    res.json(
      await saveDietPhases(req.userId, parsed.data, req.authenticatedUserId)
    );
  } catch (error) {
    if (error instanceof DietPhaseValidationError) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    next(error);
  }
});

export default router;
