import express from 'express';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { log } from '../config/logging.js';
import { isAdmin, authenticate } from '../middleware/authMiddleware.js';
import {
  getOpenFoodFactsAdminSyncStatus,
  saveGlobalSettingsWithOpenFoodFactsSync,
} from '../services/openFoodFactsSyncSettingsService.js';
const router = express.Router();

router.get(
  '/openfoodfacts-contributions/status',
  isAdmin,
  async (_req, res) => {
    try {
      res.json(await getOpenFoodFactsAdminSyncStatus());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error retrieving Open Food Facts sync status: ${message}`);
      res.status(500).json({
        message: 'Error retrieving Open Food Facts sync status',
      });
    }
  }
);
/**
 * @swagger
 * /admin/global-settings:
 *   get:
 *     summary: GET Global Authentication Settings (Admin Only)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Global settings.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GlobalSettings'
 */
router.get('/', isAdmin, async (req, res) => {
  try {
    const settings = await globalSettingsRepository.getGlobalSettings();
    res.json(settings);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error getting global auth settings: ${error.message}`);
    res.status(500).json({ message: 'Error retrieving global auth settings' });
  }
});
/**
 * @swagger
 * /admin/global-settings:
 *   put:
 *     summary: Update Global Authentication Settings (Admin Only)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GlobalSettings'
 *     responses:
 *       200:
 *         description: Settings updated successfully.
 */
router.put('/', isAdmin, async (req, res) => {
  try {
    const settingsData = req.body;
    const newSettings =
      await saveGlobalSettingsWithOpenFoodFactsSync(settingsData);
    log('info', 'Global auth settings updated successfully.');
    res.status(200).json(newSettings);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error updating global auth settings: ${error.message}`);
    res.status(500).json({ message: 'Error updating global auth settings' });
  }
});
/**
 * @swagger
 * /global-settings/allow-user-ai-config:
 *   get:
 *     summary: Check if users are allowed to configure AI services (Public)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Returns whether user AI config is allowed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allow_user_ai_config:
 *                   type: boolean
 */
router.get('/allow-user-ai-config', authenticate, async (req, res) => {
  try {
    const isAllowed = await globalSettingsRepository.isUserAiConfigAllowed();
    res.json({ allow_user_ai_config: isAllowed });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error checking user AI config permission: ${error.message}`);
    res
      .status(500)
      .json({ message: 'Error checking user AI config permission' });
  }
});
/**
 * @swagger
 * /global-settings/mock-data-enabled:
 *   get:
 *     summary: Check if the runtime mock-data options are available (Authenticated)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Returns whether an admin has enabled the mock-data options.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mock_data_enabled:
 *                   type: boolean
 */
router.get('/mock-data-enabled', authenticate, async (_req, res) => {
  try {
    const isEnabled = await globalSettingsRepository.isMockDataEnabled();
    res.json({ mock_data_enabled: isEnabled });
  } catch (error) {
    log(
      'error',
      `Error checking mock data setting: ${error instanceof Error ? error.message : String(error)}`
    );
    res.status(500).json({ message: 'Error checking mock data setting' });
  }
});
export default router;
