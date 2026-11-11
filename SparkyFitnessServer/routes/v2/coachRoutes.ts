import express from 'express';
import { z } from 'zod';
import {
  createCoachBodySchema,
  updateCoachBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import {
  CoachLimitError,
  createCoach,
  deleteCoach,
  listCoaches,
  updateCoach,
} from '../../models/customCoachRepository.js';

/**
 * A person's own coaches (#2013). The built-in coaches are shared constants
 * and are not served here.
 */
const router = express.Router();
router.use(authenticate);
// Coaches belong to the signed-in actor, like the rest of the private
// assistant state, including while viewing a family member's data.
router.use((req, _res, next) => {
  req.userId = req.authenticatedUserId || req.userId;
  next();
});

// A non-UUID id would reach a UUID column and raise a database error the
// shared error handler answers with 500; it is simply not a coach.
const idParamSchema = z.uuid();

/**
 * @swagger
 * /v2/coaches:
 *   get:
 *     summary: List the person's own coaches
 *     description: Returns the coaches the signed-in person created. Built-in coaches are not included. Scoped to the signed-in actor and never delegated.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: The coaches, by name.
 *   post:
 *     summary: Create a coach
 *     description: A coach adds its instructions to a chat and limits the chat to its tool categories. At most 20 per person.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, system_prompt, tool_categories]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               system_prompt:
 *                 type: string
 *               tool_categories:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       '201':
 *         description: The created coach.
 *       '400':
 *         description: Invalid body.
 *       '409':
 *         description: The person already has the most coaches allowed.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await listCoaches(req.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = createCoachBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.format(),
    });
  }
  try {
    res.status(201).json(await createCoach(req.userId, parsed.data));
  } catch (error) {
    if (error instanceof CoachLimitError) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/coaches/{id}:
 *   patch:
 *     summary: Change a coach
 *     description: Only the fields sent change; a null description clears it.
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
 *       '200':
 *         description: The updated coach.
 *       '400':
 *         description: Invalid body.
 *       '404':
 *         description: No such coach.
 *   delete:
 *     summary: Delete a coach
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
 *         description: Deleted.
 *       '404':
 *         description: No such coach.
 */
router.patch('/:id', async (req, res, next) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Coach not found' });
  const parsed = updateCoachBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.format(),
    });
  }
  try {
    const coach = await updateCoach(req.userId, id.data, parsed.data);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });
    res.json(coach);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Coach not found' });
  try {
    const deleted = await deleteCoach(req.userId, id.data);
    if (!deleted) return res.status(404).json({ error: 'Coach not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
