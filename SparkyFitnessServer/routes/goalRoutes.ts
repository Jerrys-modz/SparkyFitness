import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import goalService from '../services/goalService.js';
import weightCoachingService, {
  CoachingConflictError,
} from '../services/weightCoachingService.js';
import {
  acceptCoachingCheckInBodySchema,
  updateCoachingSettingsBodySchema,
} from '@workspace/shared';
const router = express.Router();
/**
 * @swagger
 * /goals/by-date/{date}:
 *   get:
 *     summary: Get goals for a specific date
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
 */
router.get(
  '/by-date/:date',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const { date } = req.params;
    const adjust = req.query.adjust === 'true';
    if (!date) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    try {
      const goals = await goalService.getUserGoals(
        req.userId,
        date,
        undefined,
        adjust
      );
      res.status(200).json(goals);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /goals/for-date:
 *   get:
 *     summary: Get goals for a date (query param)
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
 */
router.get(
  '/for-date',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const { date, userId, end_date, adjust } = req.query; // Check for userId in query (for backward compatibility if needed, but middleware handles it)
    const shouldAdjust = adjust === 'true';
    if (!date) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    // Determine target user

    const targetUserId = userId || req.userId;
    try {
      if (end_date) {
        const goals = await goalService.getUserGoalsForRange(
          targetUserId as string,
          date as string,
          end_date as string,
          shouldAdjust
        );
        res.status(200).json(goals);
      } else {
        const goals = await goalService.getUserGoals(
          targetUserId as string,
          date as string,
          undefined,
          shouldAdjust
        );
        res.status(200).json(goals);
      }
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /goals/manage-timeline:
 *   post:
 *     summary: Manage goal timeline (upsert goals over a range)
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               p_start_date: { type: 'string', format: 'date' }
 *               p_end_date: { type: 'string', format: 'date', nullable: true }
 *               calories: { type: 'number' }
 *               # ... other goal fields ...
 *             required: [p_start_date]
 *     responses:
 *       200:
 *         description: Timeline managed successfully.
 */
router.post('/manage-timeline', authenticate, async (req, res, next) => {
  const authenticatedUserId = req.userId;
  const goalData = req.body;
  if (!goalData.p_start_date) {
    return res.status(400).json({ error: 'Start date is required.' });
  }
  try {
    const result = await goalService.manageGoalTimeline(
      authenticatedUserId,
      goalData
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /goals/coaching-settings:
 *   put:
 *     summary: Save the weight coaching goal (direction, kg per week) and check-in weekday
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               direction: { type: 'string', enum: [lose, maintain, gain] }
 *               rateKgPerWeek: { type: 'number', minimum: 0, maximum: 1 }
 *               checkInWeekday: { type: 'integer', minimum: 0, maximum: 6 }
 *     responses:
 *       200:
 *         description: The saved settings.
 */
router.put(
  '/coaching-settings',
  authenticate,
  requireSelfActor,
  async (req, res, next) => {
    const parsed = updateCoachingSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message });
    }
    try {
      res
        .status(200)
        .json(
          await weightCoachingService.updateCoachingSettings(
            req.userId,
            parsed.data
          )
        );
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @swagger
 * /goals/coaching-checkin/accept:
 *   post:
 *     summary: Accept the suggested targets from the weekly coaching check-in
 *     description: >
 *       Recomputes the check-in and, if the calories match what the person was
 *       shown, saves the new targets from today through the goals timeline.
 *       Answers 409 when the check-in has changed, there is nothing to accept,
 *       or Calorie Settings set the calorie target.
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               calories: { type: 'integer' }
 *             required: [calories]
 *     responses:
 *       200:
 *         description: The targets now in effect.
 *       409:
 *         description: Nothing was changed; the body carries a `code`.
 */
router.post(
  '/coaching-checkin/accept',
  authenticate,
  requireSelfActor,
  async (req, res, next) => {
    const parsed = acceptCoachingCheckInBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message });
    }
    try {
      const targets = await weightCoachingService.acceptCoachingCheckIn(
        req.userId,
        parsed.data.calories
      );
      res.status(200).json(targets);
    } catch (error) {
      if (error instanceof CoachingConflictError) {
        return res.status(409).json({ error: error.message, code: error.code });
      }
      next(error);
    }
  }
);
export default router;
