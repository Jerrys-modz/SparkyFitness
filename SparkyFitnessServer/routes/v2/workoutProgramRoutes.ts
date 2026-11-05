import express from 'express';
import { importWorkoutProgramRequestSchema } from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
  WorkoutProgramExercisesUnavailableError,
  WorkoutProgramNotFoundError,
} from '../../services/workoutProgramService.js';

/**
 * Sharing workout presets and plans as program files (JSON, contract in
 * `WorkoutPrograms.api.zod.ts`). Owner-only: an export is read with the
 * person's own access (their own, public or family-shared items), and an
 * import adds to their own library, presets and plans.
 */
const router = express.Router();

router.use(requireSelfActor);

function sendFile(
  res: express.Response,
  name: string,
  file: object
): express.Response {
  const safeName =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'workout';
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeName}.sparkyfitness.json"`
  );
  return res.json(file);
}

/**
 * @swagger
 * /v2/workout-programs/presets/{presetId}/export:
 *   get:
 *     summary: Export a workout preset as a program file
 *     description: >
 *       A self-contained JSON file with the preset and the definition of each
 *       exercise it uses, with no database or user ids, to send to someone.
 *     tags: [Exercise]
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: The program file.
 *       404:
 *         description: Preset not found or not visible to the person.
 */
router.get('/presets/:presetId/export', async (req, res, next) => {
  try {
    const file = await exportWorkoutPreset(req.userId, req.params.presetId);
    return sendFile(res, file.presets[0]?.name ?? 'preset', file);
  } catch (error) {
    if (error instanceof WorkoutProgramNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/workout-programs/plans/{planId}/export:
 *   get:
 *     summary: Export a workout plan as a program file
 *     description: >
 *       A self-contained JSON file with the plan, every preset it runs and the
 *       definition of each exercise, with no database or user ids.
 *     tags: [Exercise]
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: The program file.
 *       404:
 *         description: Plan not found or not visible to the person.
 */
router.get('/plans/:planId/export', async (req, res, next) => {
  try {
    const file = await exportWorkoutPlan(req.userId, req.params.planId);
    return sendFile(res, file.plan?.name ?? 'plan', file);
  } catch (error) {
    if (error instanceof WorkoutProgramNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/workout-programs/import:
 *   post:
 *     summary: Import a workout program file
 *     description: >
 *       Adds the file's exercises to the person's library (from
 *       free-exercise-db when the file names one, else matched by name or
 *       created as custom exercises), then creates its presets as private
 *       presets and its plan, if any. Nothing but library exercises is kept
 *       when a step fails.
 *     tags: [Exercise]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [program]
 *             properties:
 *               program:
 *                 type: object
 *               planName:
 *                 type: string
 *               activate:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: The new plan (or null), the preset made for each preset key and how many exercises were added.
 *       400:
 *         description: Not a valid workout program file.
 *       502:
 *         description: Some exercises could not be added (`missingExerciseIds`); nothing was created.
 */
router.post('/import', async (req, res, next) => {
  try {
    const parsed = importWorkoutProgramRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Not a valid workout program file.',
        details: parsed.error.flatten(),
      });
    }
    const result = await importWorkoutProgram(req.userId, parsed.data.program, {
      planName: parsed.data.planName,
      activate: parsed.data.activate,
      allowCustomExercises: true,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof WorkoutProgramExercisesUnavailableError) {
      return res.status(502).json({
        error: error.message,
        missingExerciseIds: error.missingExerciseIds,
      });
    }
    next(error);
  }
});

export default router;
