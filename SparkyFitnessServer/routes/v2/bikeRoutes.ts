import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  assignBikeBodySchema,
  bikeStatusSchema,
  createBikeBodySchema,
  createBikeComponentBodySchema,
  replaceBikeComponentBodySchema,
  retireBikeComponentBodySchema,
  todayInZone,
  updateBikeBodySchema,
  updateBikeComponentBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import {
  assignBikeToExerciseEntry,
  createBike,
  createBikeComponent,
  deleteBike,
  deleteBikeComponent,
  getBikeById,
  getBikes,
  replaceBikeComponent,
  retireBikeComponent,
  updateBike,
  updateBikeComponent,
} from '../../models/bikeRepository.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

type BikeRequest = Request<Record<string, string>>;

const actorOf = (req: BikeRequest): string =>
  req.authenticatedUserId || req.userId;

function invalidBody(res: Response, error: { format: () => unknown }) {
  return res
    .status(400)
    .json({ error: 'Invalid request body', details: error.format() });
}

type Handler = (req: BikeRequest, res: Response) => Promise<unknown>;
const handle =
  (fn: Handler) => (req: BikeRequest, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/**
 * @swagger
 * /v2/bikes:
 *   get:
 *     summary: List bikes
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, retired]
 *         description: Only return bikes with this status
 *     responses:
 *       200:
 *         description: Bikes with distance and moving time derived from linked diary entries
 *       400:
 *         description: status is not active or retired
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/bikes?status=active|retired
router.get(
  '/',
  handle(async (req, res) => {
    let status;
    if (req.query.status !== undefined) {
      const parsed = bikeStatusSchema.safeParse(req.query.status);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'status must be active or retired' });
      }
      status = parsed.data;
    }
    res.json(await getBikes(req.userId, actorOf(req), status));
  })
);

/**
 * @swagger
 * /v2/bikes/assignments/{exerciseEntryId}:
 *   put:
 *     summary: Link a diary entry to a bike, or clear the link
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseEntryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bike_id]
 *             properties:
 *               bike_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Bike to link, or null to clear
 *     responses:
 *       200:
 *         description: The updated assignment
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Exercise entry or bike not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/bikes/assignments/:exerciseEntryId  { bike_id: string | null }
// Registered before /:id so "assignments" is never read as a bike id.
router.put(
  '/assignments/:exerciseEntryId',
  handle(async (req, res) => {
    const parsed = assignBikeBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const assigned = await assignBikeToExerciseEntry(
      req.userId,
      req.params.exerciseEntryId,
      parsed.data.bike_id,
      actorOf(req)
    );
    if (!assigned) {
      return res
        .status(404)
        .json({ error: 'Exercise entry or bike not found' });
    }
    res.json(assigned);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}:
 *   get:
 *     summary: Get one bike with its components
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bike id
 *     responses:
 *       200:
 *         description: The bike, with active components first and retired components as history
 *       404:
 *         description: Bike not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/bikes/:id
router.get(
  '/:id',
  handle(async (req, res) => {
    const bike = await getBikeById(req.userId, req.params.id, actorOf(req));
    if (!bike) return res.status(404).json({ error: 'Bike not found' });
    res.json(bike);
  })
);

/**
 * @swagger
 * /v2/bikes:
 *   post:
 *     summary: Add a bike
 *     tags: [Fitness & Workouts]
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
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               brand: {type: string, nullable: true, maxLength: 120}
 *               model: {type: string, nullable: true, maxLength: 120}
 *               purchase_date: {type: string, format: date, nullable: true}
 *               purchase_price: {type: number, minimum: 0, maximum: 99999999.99, nullable: true}
 *               starting_distance_km: {type: number, minimum: 0, maximum: 9999999.99}
 *               starting_moving_time_seconds: {type: integer, minimum: 0}
 *               is_default: {type: boolean}
 *     responses:
 *       201:
 *         description: The created bike
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/bikes
router.post(
  '/',
  handle(async (req, res) => {
    const parsed = createBikeBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    res
      .status(201)
      .json(await createBike(req.userId, parsed.data, actorOf(req)));
  })
);

/**
 * @swagger
 * /v2/bikes/{id}:
 *   put:
 *     summary: Update, retire or reactivate a bike
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bike id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               brand: {type: string, nullable: true, maxLength: 120}
 *               model: {type: string, nullable: true, maxLength: 120}
 *               purchase_date: {type: string, format: date, nullable: true}
 *               purchase_price: {type: number, minimum: 0, maximum: 99999999.99, nullable: true}
 *               starting_distance_km: {type: number, minimum: 0, maximum: 9999999.99}
 *               starting_moving_time_seconds: {type: integer, minimum: 0}
 *               is_default: {type: boolean}
 *               status: {type: string, enum: [active, retired]}
 *     responses:
 *       200:
 *         description: The updated bike
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Bike not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/bikes/:id
router.put(
  '/:id',
  handle(async (req, res) => {
    const parsed = updateBikeBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateBike(
      req.userId,
      req.params.id,
      parsed.data,
      actorOf(req)
    );
    if (!updated) return res.status(404).json({ error: 'Bike not found' });
    res.json(updated);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}:
 *   delete:
 *     summary: Delete a bike and its components
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bike id
 *     responses:
 *       200:
 *         description: Deleted; linked diary entries keep their data but lose the link
 *       404:
 *         description: Bike not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/bikes/:id
router.delete(
  '/:id',
  handle(async (req, res) => {
    const deleted = await deleteBike(req.userId, req.params.id, actorOf(req));
    if (!deleted) return res.status(404).json({ error: 'Bike not found' });
    res.json({ success: true, message: 'Bike deleted successfully' });
  })
);

/**
 * @swagger
 * /v2/bikes/{id}/components:
 *   post:
 *     summary: Install a component on a bike
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bike id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [component_type, name, installed_on]
 *             properties:
 *               component_type: {type: string, enum: [chain, cassette, tires, brake_pads, cables, bar_tape, custom]}
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               installed_on: {type: string, format: date}
 *               expected_life_km: {type: number, exclusiveMinimum: 0, maximum: 9999999.99, nullable: true}
 *               expected_life_hours: {type: number, exclusiveMinimum: 0, maximum: 999999.99, nullable: true}
 *               notes: {type: string, maxLength: 1000, nullable: true}
 *     responses:
 *       201:
 *         description: The installed component; with no expected life set the type's default kilometres apply
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Bike not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/bikes/:id/components
router.post(
  '/:id/components',
  handle(async (req, res) => {
    const parsed = createBikeComponentBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createBikeComponent(
      req.userId,
      req.params.id,
      parsed.data,
      actorOf(req)
    );
    if (!created) return res.status(404).json({ error: 'Bike not found' });
    res.status(201).json(created);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}/components/{componentId}:
 *   put:
 *     summary: Edit a component's name, install date, expected life or notes
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: componentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               installed_on: {type: string, format: date}
 *               expected_life_km: {type: number, exclusiveMinimum: 0, maximum: 9999999.99, nullable: true}
 *               expected_life_hours: {type: number, exclusiveMinimum: 0, maximum: 999999.99, nullable: true}
 *               notes: {type: string, maxLength: 1000, nullable: true}
 *     responses:
 *       200:
 *         description: The updated component
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Component not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/bikes/:id/components/:componentId
router.put(
  '/:id/components/:componentId',
  handle(async (req, res) => {
    const parsed = updateBikeComponentBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateBikeComponent(
      req.userId,
      req.params.id,
      req.params.componentId,
      parsed.data,
      actorOf(req)
    );
    if (!updated) return res.status(404).json({ error: 'Component not found' });
    res.json(updated);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}/components/{componentId}/retire:
 *   post:
 *     summary: Retire a component without replacing it
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: componentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retired_on: {type: string, format: date, description: Defaults to today in the user's timezone}
 *     responses:
 *       200:
 *         description: The retired component, kept as history
 *       400:
 *         description: Invalid body or a date before the install date
 *       404:
 *         description: Component not found
 *       409:
 *         description: Component is already retired
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/bikes/:id/components/:componentId/retire
router.post(
  '/:id/components/:componentId/retire',
  handle(async (req, res) => {
    const parsed = retireBikeComponentBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalidBody(res, parsed.error);
    const retiredOn =
      parsed.data.retired_on ?? todayInZone(await loadUserTimezone(req.userId));
    const result = await retireBikeComponent(
      req.userId,
      req.params.id,
      req.params.componentId,
      retiredOn,
      actorOf(req)
    );
    if (result.kind === 'not_found') {
      return res.status(404).json({ error: 'Component not found' });
    }
    if (result.kind === 'already_retired') {
      return res.status(409).json({ error: 'Component is already retired' });
    }
    if (result.kind === 'before_install') {
      return res
        .status(400)
        .json({ error: 'retired_on is before the install date' });
    }
    res.json(result.component);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}/components/{componentId}/replace:
 *   post:
 *     summary: Replace a component, keeping the old one as history
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: componentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               replaced_on: {type: string, format: date, description: Defaults to today in the user's timezone}
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               expected_life_km: {type: number, exclusiveMinimum: 0, maximum: 9999999.99, nullable: true}
 *               expected_life_hours: {type: number, exclusiveMinimum: 0, maximum: 999999.99, nullable: true}
 *     responses:
 *       201:
 *         description: The retired component and the new one, whose counter starts at zero
 *       400:
 *         description: Invalid body or a date before the install date
 *       404:
 *         description: Component not found
 *       409:
 *         description: Component is already retired
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/bikes/:id/components/:componentId/replace
router.post(
  '/:id/components/:componentId/replace',
  handle(async (req, res) => {
    const parsed = replaceBikeComponentBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalidBody(res, parsed.error);
    const replacedOn =
      parsed.data.replaced_on ??
      todayInZone(await loadUserTimezone(req.userId));
    const result = await replaceBikeComponent(
      req.userId,
      req.params.id,
      req.params.componentId,
      replacedOn,
      parsed.data,
      actorOf(req)
    );
    if (result.kind === 'not_found') {
      return res.status(404).json({ error: 'Component not found' });
    }
    if (result.kind === 'already_retired') {
      return res.status(409).json({ error: 'Component is already retired' });
    }
    if (result.kind === 'before_install') {
      return res
        .status(400)
        .json({ error: 'replaced_on is before the install date' });
    }
    res.status(201).json(result.result);
  })
);

/**
 * @swagger
 * /v2/bikes/{id}/components/{componentId}:
 *   delete:
 *     summary: Delete a component and its history entry
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: componentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Component not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/bikes/:id/components/:componentId
router.delete(
  '/:id/components/:componentId',
  handle(async (req, res) => {
    const deleted = await deleteBikeComponent(
      req.userId,
      req.params.id,
      req.params.componentId,
      actorOf(req)
    );
    if (!deleted) return res.status(404).json({ error: 'Component not found' });
    res.json({ success: true, message: 'Component deleted successfully' });
  })
);

export default router;
