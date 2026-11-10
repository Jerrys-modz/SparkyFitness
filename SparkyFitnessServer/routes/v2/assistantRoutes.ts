import express from 'express';
import { assistantDailySummaryRequestSchema } from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  DailySummaryProviderError,
  getDailySummary,
} from '../../services/assistantDailySummaryService.js';
import { resolveIsAdmin } from '../../utils/adminCheck.js';

/**
 * Sparky outside the chat (#2013). Owner-only: the summary is written from the
 * signed-in person's own data with their own AI service, so a delegated
 * context is refused.
 */
const router = express.Router();

router.use(requireSelfActor);

/**
 * @swagger
 * /v2/assistant/daily-summary:
 *   post:
 *     summary: Get Sparky's short summary of today
 *     description: Writes a few sentences about the day so far and at most two suggestions with the person's own chat AI service, from what they logged today and yesterday and the preferences they saved. A summary is reused for three hours unless refresh is true. No AI request is made when no AI service is set up (status no_ai_service) or nothing was logged (status no_data).
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: The summary, or the reason there is none.
 *       '400':
 *         description: Invalid body.
 *       '403':
 *         description: Not available while acting for another person.
 *       '502':
 *         description: The AI service failed or returned an unusable answer.
 */
router.post('/daily-summary', async (req, res, next) => {
  const parsed = assistantDailySummaryRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  try {
    const actorIsAdmin = await resolveIsAdmin(
      req.user,
      req.authenticatedUserId
    );
    res.json(
      await getDailySummary(req.userId, {
        refresh: parsed.data.refresh,
        actorIsAdmin,
      })
    );
  } catch (error) {
    if (error instanceof DailySummaryProviderError) {
      return res.status(502).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
