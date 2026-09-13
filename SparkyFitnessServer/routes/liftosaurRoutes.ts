import express from 'express';
import liftosaurService, {
  liftosaurErrorReason,
} from '../integrations/liftosaur/liftosaurService.js';
import { log } from '../config/logging.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /integrations/liftosaur/sync:
 *   post:
 *     summary: Manually trigger a Liftosaur data sync
 *     tags: [External Integrations]
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId as string;
    const createdByUserId = userId;
    const { providerId, startDate, endDate } = req.body as {
      providerId?: string;
      startDate?: string | null;
      endDate?: string | null;
    };
    const fullSync =
      req.query.fullSync === 'true' || (req.body as { fullSync?: boolean }).fullSync === true;
    log(
      'info',
      `[liftosaurRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
    );
    const result = await liftosaurService.syncLiftosaurData(
      userId,
      createdByUserId,
      fullSync,
      providerId,
      startDate,
      endDate
    );
    res.status(200).json(result);
  } catch (error) {
    const { status, code } = liftosaurErrorReason(error);
    log('error', `Error initiating manual Liftosaur sync: ${errorMessage(error)}`);
    if (status === 401) {
      return res.status(401).json({
        message:
          'Invalid Liftosaur API key. Generate a key in the Liftosaur app (Settings > API Keys) and try again.',
        error: errorMessage(error),
      });
    }
    if (status === 403 && code === 'subscription_required') {
      return res.status(403).json({
        message:
          'Your Liftosaur account needs an active subscription to use the Liftosaur API.',
        error: errorMessage(error),
      });
    }
    res.status(500).json({
      message: 'Error initiating manual Liftosaur sync',
      error: errorMessage(error),
    });
  }
});

/**
 * @swagger
 * /integrations/liftosaur/status:
 *   get:
 *     summary: Get Liftosaur connection status
 *     tags: [External Integrations]
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId as string;
    const status = await liftosaurService.getStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    log('error', `Error getting Liftosaur status: ${errorMessage(error)}`);
    res.status(500).json({
      message: 'Error getting Liftosaur status',
      error: errorMessage(error),
    });
  }
});

/**
 * @swagger
 * /integrations/liftosaur/disconnect:
 *   post:
 *     summary: Disconnect the Liftosaur integration for the authenticated user
 *     tags: [External Integrations]
 */
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId as string;
    const { providerId } = req.body as { providerId?: string };
    const disconnected = await liftosaurService.disconnect(userId, providerId);
    if (!disconnected) {
      return res.status(404).json({ message: 'Liftosaur provider not found.' });
    }
    res.status(200).json({ message: 'Liftosaur disconnected successfully.' });
  } catch (error) {
    log('error', `Error disconnecting Liftosaur: ${errorMessage(error)}`);
    res.status(500).json({
      message: 'Error disconnecting Liftosaur',
      error: errorMessage(error),
    });
  }
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default router;
