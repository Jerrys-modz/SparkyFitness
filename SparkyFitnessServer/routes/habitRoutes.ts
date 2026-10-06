import express from 'express';
import { z } from 'zod';
import {
  createHabitRequestSchema,
  habitLogsQuerySchema,
  logHabitRequestSchema,
} from '@workspace/shared';
import habitRepository from '../models/habitRepository.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';

const router = express.Router();
router.use(authenticate);
// Habits are boolean custom_categories rows, which RLS treats as check-in data.
router.use(checkPermissionMiddleware('checkin'));

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * @swagger
 * /habits:
 *   get:
 *     summary: List habits
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The user's habits.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await habitRepository.listHabits(req.userId));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /habits/logs:
 *   get:
 *     summary: List habit completions in a date range
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Habit log rows (habit_id, entry_date, completed).
 */
router.get('/logs', async (req, res, next) => {
  try {
    const query = habitLogsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: query.error.flatten() });
    }
    res.json(
      await habitRepository.listHabitLogsInRange(
        req.userId,
        query.data.startDate,
        query.data.endDate
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /habits:
 *   post:
 *     summary: Create a habit
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50 }
 *     responses:
 *       201:
 *         description: The created habit.
 */
router.post('/', async (req, res, next) => {
  try {
    const body = createHabitRequestSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: body.error.flatten() });
    }
    const created = await habitRepository.createHabit(
      req.userId,
      body.data.name
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /habits/{id}/log:
 *   put:
 *     summary: Mark a habit done or not done for a day
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entry_date, completed]
 *             properties:
 *               entry_date: { type: string, format: date }
 *               completed: { type: boolean }
 *     responses:
 *       204:
 *         description: Logged.
 *       404:
 *         description: Habit not found.
 */
router.put('/:id/log', async (req, res, next) => {
  try {
    const params = idParamSchema.safeParse(req.params);
    const body = logHabitRequestSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return res.status(400).json({
        error: (params.success ? body : params).error?.flatten(),
      });
    }
    if (!(await habitRepository.habitExists(req.userId, params.data.id))) {
      return res.status(404).json({ error: 'Habit not found.' });
    }
    await habitRepository.upsertHabitLog(
      req.userId,
      params.data.id,
      body.data.entry_date,
      body.data.completed ? 'true' : 'false'
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /habits/{id}:
 *   delete:
 *     summary: Delete a habit and its history
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: Habit not found.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: params.error.flatten() });
    }
    const ok = await habitRepository.deleteHabit(req.userId, params.data.id);
    if (!ok) return res.status(404).json({ error: 'Habit not found.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
