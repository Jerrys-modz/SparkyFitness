import express from 'express';
import { importWorkoutSplitRequestSchema } from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import { ValidationError } from '../../utils/errors.js';
import {
  importWorkoutSplit,
  UnknownWorkoutSplitError,
  WorkoutSplitExercisesUnavailableError,
} from '../../services/workoutSplitService.js';

/**
 * Built-in strength splits. The catalog itself is `WORKOUT_SPLITS` in
 * `@workspace/shared`, so clients list it without a request; this route only
 * makes the person's own copy of one. Owner-only: it adds to the person's own
 * exercise library, presets and plans, so a delegated context is refused.
 */
const router = express.Router();

router.use(requireSelfActor);

/**
 * @swagger
 * /v2/workout-splits/{splitId}/import:
 *   post:
 *     summary: Import a built-in workout split
 *     description: >
 *       Adds the split's exercises to the person's library from
 *       free-exercise-db, creates one preset per session and a sequential
 *       workout plan that runs them in order. Nothing is created when the
 *       exercise database cannot supply every exercise.
 *     tags: [Exercise]
 *     parameters:
 *       - in: path
 *         name: splitId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planName, sessionNames]
 *             properties:
 *               planName:
 *                 type: string
 *               sessionNames:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *               activate:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: The new plan, the preset made for each session and how many exercises were added to the library.
 *       400:
 *         description: Invalid body, or a session has no name.
 *       404:
 *         description: Unknown split.
 *       502:
 *         description: The exercise database could not supply some exercises (`missingExerciseIds`); nothing was created.
 */
router.post('/:splitId/import', async (req, res, next) => {
  try {
    const parsed = importWorkoutSplitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid workout split import.',
        details: parsed.error.flatten(),
      });
    }
    const result = await importWorkoutSplit(
      req.userId,
      req.params.splitId,
      parsed.data
    );
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof UnknownWorkoutSplitError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof WorkoutSplitExercisesUnavailableError) {
      return res.status(502).json({
        error: error.message,
        missingExerciseIds: error.missingExerciseIds,
      });
    }
    next(error);
  }
});

export default router;
