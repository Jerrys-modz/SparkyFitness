import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import exerciseService from '../services/exerciseService.js';
const router = express.Router();
/**
 * @swagger
 * /exercisedb/add:
 *   post:
 *     summary: Add an ExerciseDB exercise to user's local exercises
 *     tags: [Fitness & Workouts]
 *     description: Adds a selected exercise from the ExerciseDB (AscendAPI) catalogue to the authenticated user's personal exercise list. The exercise's GIF is stored as a link to the API's CDN, not downloaded.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exerciseId
 *             properties:
 *               exerciseId:
 *                 type: string
 *                 description: The ExerciseDB exercise ID to add.
 *     responses:
 *       201:
 *         description: The newly created exercise in the user's database.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Exercise ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Error adding ExerciseDB exercise.
 */
router.post('/add', authenticate, async (req, res, next) => {
  try {
    const { exerciseId } = req.body;
    // Checked for type, not just presence: a JSON body can carry an object or
    // array through a falsiness check.
    if (typeof exerciseId !== 'string') {
      return res.status(400).json({ message: 'Exercise ID is required.' });
    }
    const exerciseDBId = exerciseId.trim();
    if (exerciseDBId === '') {
      return res.status(400).json({ message: 'Exercise ID is required.' });
    }
    const newExercise =
      await exerciseService.addExerciseDBExerciseToUserExercises(
        req.userId,
        exerciseDBId
      );
    res.status(201).json(newExercise);
  } catch (error) {
    next(error);
  }
});
export default router;
