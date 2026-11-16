import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { createRequireSelfActor } from '../middleware/requireSelfMiddleware.js';
import { setGoalWeightBodySchema } from '@workspace/shared';
import onboardingService from '../services/onboardingService.js';
import goalWeightPlanService from '../services/goalWeightPlanService.js';
import {
  BODY_FAT_GOAL_MAX_PERCENT,
  BODY_FAT_GOAL_MIN_PERCENT,
  isValidBodyFatGoal,
  roundBodyFatPercent,
} from '@workspace/shared';
const router = express.Router();
router.use(express.json());
// Only the account owner can answer, skip or reset their onboarding, or set
// their goal weight or body fat goal: RLS lets only the owner write onboarding_status and
// onboarding_data, so for someone acting for them a skip or reset would match
// no row and still answer 200. The status stays readable to them.
const selfOnly = createRequireSelfActor({
  action: 'an onboarding change',
  message: 'Forbidden: onboarding can only be changed on your own account.',
});
/**
 * @route   POST /api/onboarding
 * @desc    Submit user onboarding data
 * @access  Private
 */
/**
 * @swagger
 * /onboarding:
 *   post:
 *     summary: Submit user onboarding data
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
 *               sex: { type: 'string' }
 *               primaryGoal: { type: 'string' }
 *               currentWeight: { type: 'number' }
 *               height: { type: 'number' }
 *               birthDate: { type: 'string', format: 'date' }
 *               activityLevel: { type: 'string' }
 *               targetWeight: { type: 'number' }
 *             required: [sex, primaryGoal, currentWeight, height, birthDate, activityLevel, targetWeight]
 *     responses:
 *       201:
 *         description: Onboarding completed successfully.
 *       403:
 *         description: Acting for another account; only the owner can submit onboarding.
 */
router.post('/', authenticate, selfOnly, async (req, res, next) => {
  try {
    const userId = req.userId;
    const onboardingData = req.body;
    const {
      sex,
      primaryGoal,
      currentWeight,
      height,
      birthDate,
      activityLevel,
      targetWeight,
    } = onboardingData;
    if (
      !sex ||
      !primaryGoal ||
      !currentWeight ||
      !height ||
      !birthDate ||
      !activityLevel ||
      !targetWeight
    ) {
      return res.status(400).json({
        error: 'Missing one or more required onboarding fields.',
        details:
          'Ensure sex, primaryGoal, currentWeight, height, birthDate, activityLevel, and targetWeight are provided.',
      });
    }
    await onboardingService.processOnboardingData(userId, onboardingData);
    res.status(201).json({ message: 'Onboarding completed successfully.' });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/target-weight:
 *   put:
 *     summary: Set or clear the user's target weight (kg)
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
 *               targetWeight: { type: number, nullable: true }
 *               targetDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 description: Day to reach the goal (YYYY-MM-DD). Omit to keep the saved date; null clears it.
 *             required: [targetWeight]
 *     responses:
 *       200:
 *         description: Target weight saved.
 *       400:
 *         description: Invalid target weight.
 *       403:
 *         description: Acting for another account; only the owner can set their goal weight.
 */
router.put('/target-weight', authenticate, selfOnly, async (req, res, next) => {
  try {
    const parsed = setGoalWeightBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error:
          'targetWeight must be a number above 0 and at most 999.99 kg, or null; targetDate must be a YYYY-MM-DD day or null.',
      });
    }
    const saved = await onboardingService.setTargetWeight(
      req.userId,
      parsed.data.targetWeight,
      parsed.data.targetDate
    );
    res.status(200).json({
      targetWeight: parsed.data.targetWeight,
      targetDate: saved.targetDate,
    });
  } catch (error) {
    next(error);
  }
});
const targetBodyFatBodySchema = z.object({
  // Percent, rounded to the NUMERIC(4,1) column's one decimal and kept inside
  // the shared sane range. Null clears the goal.
  targetBodyFatPercentage: z
    .number()
    .nullable()
    .refine((pct) => pct === null || isValidBodyFatGoal(pct))
    .transform((pct) => (pct === null ? null : roundBodyFatPercent(pct))),
});
/**
 * @swagger
 * /onboarding/target-body-fat:
 *   put:
 *     summary: Set or clear the user's target body fat percentage
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
 *               targetBodyFatPercentage: { type: number, nullable: true, minimum: 3, maximum: 60 }
 *             required: [targetBodyFatPercentage]
 *     responses:
 *       200:
 *         description: Target body fat saved.
 *       400:
 *         description: Invalid target body fat.
 *       403:
 *         description: Acting for another account; only the owner can set their body fat goal.
 */
router.put(
  '/target-body-fat',
  authenticate,
  selfOnly,
  async (req, res, next) => {
    try {
      const parsed = targetBodyFatBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: `targetBodyFatPercentage must be a number from ${BODY_FAT_GOAL_MIN_PERCENT} to ${BODY_FAT_GOAL_MAX_PERCENT}, or null.`,
        });
      }
      await onboardingService.setTargetBodyFat(
        req.userId,
        parsed.data.targetBodyFatPercentage
      );
      res.status(200).json({
        targetBodyFatPercentage: parsed.data.targetBodyFatPercentage,
      });
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @swagger
 * /onboarding/target-weight/plan:
 *   get:
 *     summary: Where the goal weight and its target date stand against the calorie goal
 *     description: >
 *       Returns the pace the target date needs, the pace the saved calorie goal
 *       gives, a suggested pace with its calories, warnings and the earliest
 *       reachable date. Read-only; it never changes the calorie goal.
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The goal weight plan (plan is null without a goal, date or weigh-ins).
 */
router.get(
  '/target-weight/plan',
  authenticate,
  selfOnly,
  async (req, res, next) => {
    try {
      res
        .status(200)
        .json(await goalWeightPlanService.getGoalWeightPlan(req.userId));
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @route   GET /api/onboarding/status
 * @desc    Check if the current user has completed onboarding
 * @access  Private
 */
/**
 * @swagger
 * /onboarding/status:
 *   get:
 *     summary: Check if the current user has completed onboarding
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatus'
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const status = await onboardingService.checkOnboardingStatus(userId);
    res.status(200).json({
      onboardingComplete: status.onboarding_complete,
      onboardingSkipped: status.onboarding_skipped,
    });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/start-weight:
 *   get:
 *     summary: Get the weight given in the setup wizard and the day it was given
 *     description: Used as the weight progress starting weight when it predates every weigh-in. Readable by the owner and by anyone acting for them with profile read access.
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The onboarding weight in kg and its day (YYYY-MM-DD); both null when there is none.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 weightKg: { type: number, nullable: true }
 *                 date: { type: string, format: date, nullable: true }
 */
router.get('/start-weight', authenticate, async (req, res, next) => {
  try {
    res.status(200).json(await onboardingService.getStartWeight(req.userId));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/skip:
 *   post:
 *     summary: Mark onboarding as skipped for the user
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding skipped successfully.
 *       403:
 *         description: Acting for another account; only the owner can skip onboarding.
 */
router.post('/skip', authenticate, selfOnly, async (req, res, next) => {
  try {
    const userId = req.userId;
    await onboardingService.skipOnboarding(userId);
    res.status(200).json({ message: 'Onboarding skipped successfully.' });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/reset:
 *   post:
 *     summary: Reset onboarding status for the user
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status reset successfully.
 *       403:
 *         description: Acting for another account; only the owner can reset onboarding.
 */
router.post('/reset', authenticate, selfOnly, async (req, res) => {
  try {
    const userId = req.userId;
    await onboardingService.resetOnboardingStatus(userId);
    res.status(200).json({ message: 'Onboarding status reset successfully.' });
  } catch (error) {
    console.error('Error resetting onboarding status:', error);
    res.status(500).json({ error: 'Failed to reset onboarding status.' });
  }
});
export default router;
