import express from 'express';
import { z } from 'zod';
import { updateCoachCheckinSettingsBodySchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import {
  getSettings,
  listMessages,
  markMessage,
  saveSettings,
} from '../../models/coachCheckinRepository.js';
import { checkNow } from '../../services/coachCheckinService.js';

/**
 * Coach check-ins (#2013): which coaches may speak up on their own, and the
 * messages they left.
 */
const router = express.Router();
router.use(authenticate);
// Private assistant state belongs to the signed-in actor, including while
// viewing a family member's data.
router.use((req, _res, next) => {
  req.userId = req.authenticatedUserId || req.userId;
  next();
});

const idParamSchema = z.uuid();

/**
 * @swagger
 * /v2/coach-checkins/settings:
 *   get:
 *     summary: Get the coach check-in settings
 *     description: Whether check-ins are on, which built-in coaches may check in, from which hour of the person's day, and whether their AI service words the messages. Off by default.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: The settings.
 *   put:
 *     summary: Change the coach check-in settings
 *     description: Only the fields sent change.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               coach_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               checkin_hour:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 23
 *               ai_wording:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: The updated settings.
 *       '400':
 *         description: Invalid body.
 */
router.get('/settings', async (req, res, next) => {
  try {
    res.json(await getSettings(req.userId));
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  const parsed = updateCoachCheckinSettingsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.format(),
    });
  }
  try {
    res.json(await saveSettings(req.userId, parsed.data));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/coach-checkins/messages:
 *   get:
 *     summary: List coach messages
 *     description: The check-in messages not yet dismissed, newest first. Each carries the numbers behind it and, when AI wording is on, the worded text.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: The messages.
 * /v2/coach-checkins/messages/{id}/read:
 *   post:
 *     summary: Mark a coach message as read
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Marked.
 *       '404':
 *         description: No such message.
 * /v2/coach-checkins/messages/{id}/dismiss:
 *   post:
 *     summary: Dismiss a coach message
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Dismissed.
 *       '404':
 *         description: No such message.
 * /v2/coach-checkins/check-now:
 *   post:
 *     summary: Run today's check-in now
 *     description: Evaluates the signed-in person's day with the same rules and daily limit as the scheduled check. Writes nothing while check-ins are off.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: How many new messages were written.
 */
router.get('/messages', async (req, res, next) => {
  try {
    res.json(await listMessages(req.userId));
  } catch (error) {
    next(error);
  }
});

for (const action of ['read', 'dismiss'] as const) {
  router.post(`/messages/:id/${action}`, async (req, res, next) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) {
      return res.status(404).json({ error: 'Message not found' });
    }
    try {
      const found = await markMessage(req.userId, id.data, action);
      if (!found) return res.status(404).json({ error: 'Message not found' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

router.post('/check-now', async (req, res, next) => {
  try {
    res.json({ created: await checkNow(req.userId) });
  } catch (error) {
    next(error);
  }
});

export default router;
