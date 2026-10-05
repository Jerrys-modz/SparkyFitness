import { resolveMockDataOptions } from '../utils/mockDataOptions.js';
import express from 'express';
import hevyService from '../integrations/hevy/hevyService.js';
import { log } from '../config/logging.js';
import authMiddleware from '../middleware/authMiddleware.js';
const router = express.Router();
/**
 * @swagger
 * /integrations/hevy/sync:
 *   post:
 *     summary: Manually trigger a Hevy data sync
 *     tags: [External Integrations]
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    const createdByUserId = req.userId;
    const { providerId, startDate, endDate } = req.body;
    const { dataSource, saveMockData } = await resolveMockDataOptions(
      req.body,
      req.authenticatedUserId
    );
    const fullSync =
      req.query.fullSync === 'true' || req.body.fullSync === true;
    log(
      'info',
      `[hevyRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
    );
    const result = await hevyService.syncHevyData(
      userId,
      createdByUserId,
      fullSync,
      providerId,
      startDate,
      endDate,
      dataSource,
      saveMockData
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error initiating manual Hevy sync: ${error.message}`);
    // Check for 401 Unauthorized from Hevy API
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.includes('401')) {
      return res.status(401).json({
        message: 'Invalid Hevy API Key. Please check your key and try again.',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: error.message,
      });
    }
    res.status(500).json({
      message: 'Error initiating manual Hevy sync',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
/**
 * @swagger
 * /integrations/hevy/sync-exercises:
 *   post:
 *     summary: Copy the whole Hevy exercise library into Sparky
 *     tags: [External Integrations]
 */
router.post(
  '/sync-exercises',
  authMiddleware.authenticate,
  async (req, res) => {
    try {
      const result = await hevyService.syncExerciseLibrary(
        req.userId,
        req.userId,
        req.body?.providerId
      );
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error syncing Hevy exercise library: ${message}`);
      if (message.includes('401')) {
        return res.status(401).json({
          message: 'Invalid Hevy API Key. Please check your key and try again.',
          error: message,
        });
      }
      res.status(500).json({
        message: 'Error syncing Hevy exercise library',
        error: message,
      });
    }
  }
);
/**
 * @swagger
 * /integrations/hevy/exercise-library:
 *   delete:
 *     summary: Remove exercises imported from the Hevy exercise library
 *     tags: [External Integrations]
 */
router.delete(
  '/exercise-library',
  authMiddleware.authenticate,
  async (req, res) => {
    try {
      res
        .status(200)
        .json(await hevyService.removeImportedExercises(req.userId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error removing imported Hevy exercises: ${message}`);
      res.status(500).json({
        message: 'Error removing imported Hevy exercises',
        error: message,
      });
    }
  }
);
/**
 * @swagger
 * /integrations/hevy/status:
 *   get:
 *     summary: Get Hevy connection status
 *     tags: [External Integrations]
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const status = await hevyService.getStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error getting Hevy status: ${error.message}`);
    res
      .status(500)
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      .json({ message: 'Error getting Hevy status', error: error.message });
  }
});
export default router;
