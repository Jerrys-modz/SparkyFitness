import express from 'express';
import {
  createRouteBodySchema,
  generateRouteBodySchema,
  generateRouteResponseSchema,
  importGpxRouteBodySchema,
  parseGpx,
  routeFromActivityBodySchema,
  routeStopsBodySchema,
  routeStopsResponseSchema,
  serializeGpx,
  updateRouteBodySchema,
} from '@workspace/shared';
import { fitRouteName } from '../../utils/routePrep.js';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import { generateRoute } from '../../services/routeGenerationService.js';
import {
  getRouteGenerateCapabilities,
  resolveRoutingProvider,
} from '../../services/routing/routingConfig.js';
import { resolveStopsProvider } from '../../services/routeStopsConfig.js';
import { getStopsAlongRoute } from '../../services/routeStopsService.js';
import { RoutingProviderError } from '../../services/routing/routingProvider.js';
import { createUserRateLimiter } from '../../utils/userRateLimiter.js';
import {
  ActivityHasNoRouteError,
  createRoute,
  deleteRoute,
  getActivityTrack,
  getRoute,
  InvalidRouteError,
  listRoutes,
  RouteLimitError,
  updateRoute,
} from '../../models/routeRepository.js';

/**
 * A person's saved routes. Owner-only: where someone runs is personal, so a
 * delegated context is refused outright.
 */
const router = express.Router();

router.use(requireSelfActor);

/** Each generate call can cost several engine calls, so keep it modest. */
export const GENERATE_RATE_LIMIT_MAX = 10;
export const GENERATE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const generateRateLimiter = createUserRateLimiter(
  GENERATE_RATE_LIMIT_MAX,
  GENERATE_RATE_LIMIT_WINDOW_MS
);

/** Cached lookups are cheap; this only stops one account flooding the endpoint. */
export const STOPS_RATE_LIMIT_MAX = 60;
export const STOPS_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const stopsRateLimiter = createUserRateLimiter(
  STOPS_RATE_LIMIT_MAX,
  STOPS_RATE_LIMIT_WINDOW_MS
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Maps the repository's domain errors onto responses; false if not one. */
function sendRouteError(res: express.Response, error: unknown): boolean {
  if (error instanceof InvalidRouteError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  if (error instanceof RouteLimitError) {
    res.status(409).json({ error: 'Route limit reached' });
    return true;
  }
  if (error instanceof ActivityHasNoRouteError) {
    res.status(404).json({ error: 'That activity has no GPS track' });
    return true;
  }
  return false;
}

/**
 * @swagger
 * /v2/routes:
 *   get:
 *     summary: List saved routes
 *     description: Returns summaries (no points or cues) newest first.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: 'The routes: `{ routes: RouteSummary[] }`.'
 *   post:
 *     summary: Save a route from a list of points
 *     description: >
 *       The track is thinned for storage; distance and climb are measured on
 *       the full track. `source` may be `drawn` (default) or `generated` for a
 *       route returned by `POST /v2/routes/generate`.
 *     tags: [Exercise]
 *     responses:
 *       201:
 *         description: The saved route.
 *       400:
 *         description: Invalid body, or shorter than 10 m.
 *       409:
 *         description: The person has reached the route limit.
 */
router.get('/', async (req, res, next) => {
  try {
    const routes = await listRoutes(req.userId, req.authenticatedUserId);
    res.json({ routes });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createRouteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const route = await createRoute(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.status(201).json({ route });
  } catch (error) {
    if (!sendRouteError(res, error)) next(error);
  }
});

/**
 * @swagger
 * /v2/routes/import-gpx:
 *   post:
 *     summary: Save a route from the text of a GPX file
 *     tags: [Exercise]
 *     responses:
 *       201:
 *         description: The saved route.
 *       400:
 *         description: Invalid body, no track in the file, or shorter than 10 m.
 */
router.post('/import-gpx', async (req, res, next) => {
  try {
    const parsed = importGpxRouteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const gpx = parseGpx(parsed.data.gpx);
    if (gpx.points.length < 2) {
      return res
        .status(400)
        .json({ error: 'The file has no track or route points' });
    }
    const route = await createRoute(
      req.userId,
      {
        name: fitRouteName(parsed.data.name ?? gpx.name ?? 'Imported route'),
        activity: parsed.data.activity,
        points: gpx.points,
        source: 'gpx',
      },
      req.authenticatedUserId
    );
    res.status(201).json({ route });
  } catch (error) {
    if (!sendRouteError(res, error)) next(error);
  }
});

/**
 * @swagger
 * /v2/routes/from-activity/{exerciseEntryId}:
 *   post:
 *     summary: Save the GPS track of a recorded activity as a route
 *     tags: [Exercise]
 *     responses:
 *       201:
 *         description: The saved route.
 *       404:
 *         description: The activity is not the person's or has no GPS track.
 */
router.post('/from-activity/:exerciseEntryId', async (req, res, next) => {
  try {
    const { exerciseEntryId } = req.params;
    if (!isUuid(exerciseEntryId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }
    const parsed = routeFromActivityBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const track = await getActivityTrack(
      req.userId,
      exerciseEntryId,
      req.authenticatedUserId
    );
    if (!track || track.points.length < 2) {
      throw new ActivityHasNoRouteError();
    }
    const route = await createRoute(
      req.userId,
      {
        name: fitRouteName(parsed.data.name ?? track.name ?? 'Recorded route'),
        activity: parsed.data.activity ?? 'run',
        points: track.points,
        source: 'activity',
        sourceExerciseEntryId: exerciseEntryId,
      },
      req.authenticatedUserId
    );
    res.status(201).json({ route });
  } catch (error) {
    if (!sendRouteError(res, error)) next(error);
  }
});

/**
 * @swagger
 * /v2/routes/generate/capabilities:
 *   get:
 *     summary: What route generation and stops lookup are available to the person
 *     description: >
 *       Generation needs a routing provider and stops need an Overpass
 *       provider: the one the person (or the admin, as a public provider, or a
 *       family member who shared theirs) added in Settings > External
 *       Providers. Clients use this to show or hide each feature and only the
 *       style controls the engine supports.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: >
 *           `{ available, maxAlternatives, style: { surface, hilliness,
 *           avoidSteps, avoidBusyRoads }, stops, source, stopsSource }`.
 *           `source` is `provider` when `available`, else null; `stopsSource`
 *           is `provider` when `stops`, else null.
 */
router.get('/generate/capabilities', async (req, res, next) => {
  try {
    res.json(await getRouteGenerateCapabilities(req.userId));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/routes/generate:
 *   post:
 *     summary: Generate a preview route with the configured routing engine
 *     description: >
 *       Either `mode: "loop"` (a loop or out-and-back of about `distanceM`
 *       from `start`) or `mode: "waypoints"` (route through an ordered list).
 *       Nothing is saved: the response is a preview whose fields can be sent
 *       as-is to `POST /v2/routes` (with `source: "generated"`). Limited to
 *       10 requests per user per 10 minutes.
 *     tags: [Exercise]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, start]
 *             properties:
 *               mode: { type: string, enum: [loop, waypoints] }
 *               start: { type: object, properties: { lat: { type: number }, lon: { type: number } } }
 *               activity: { type: string, enum: [run, walk, ride, hike] }
 *               name: { type: string }
 *               distanceM: { type: number, description: 'Loop mode: target distance in metres.' }
 *               shape: { type: string, enum: [loop, out_and_back] }
 *               bearingDeg: { type: number }
 *               alternatives: { type: integer, minimum: 1, maximum: 3, description: 'Loop mode: how many distinct candidates to return, at most.' }
 *               style:
 *                 type: object
 *                 description: Preferences; ignored where the engine does not support them.
 *                 properties:
 *                   surface: { type: string, enum: [any, trails, roads] }
 *                   hilliness: { type: string, enum: [any, flat, hilly] }
 *                   avoidSteps: { type: boolean }
 *                   avoidBusyRoads: { type: boolean }
 *               waypoints: { type: array, items: { type: object } }
 *               returnToStart: { type: boolean }
 *     responses:
 *       200:
 *         description: >
 *           `{ route, options }`. `route` is the first candidate (name, activity,
 *           source, points, cues, distanceM, elevationGainM); `options` lists the
 *           candidates, each as `{ route, label, trailShare }`.
 *       400:
 *         description: Invalid body.
 *       422:
 *         description: The engine found no route between those points.
 *       429:
 *         description: Too many generate requests.
 *       502:
 *         description: The routing engine failed, was unreachable, or refused the server's credentials.
 *       503:
 *         description: The person has no routing provider.
 *       504:
 *         description: The routing engine timed out.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const resolved = await resolveRoutingProvider(req.userId);
    if (!resolved) {
      return res.status(503).json({
        error:
          'Route generation needs a routing provider. Add one in Settings > External Providers.',
      });
    }
    const parsed = generateRouteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const retryAfter = generateRateLimiter.hit(req.userId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many route requests. Try again shortly.' });
    }
    const generated = await generateRoute(resolved.provider, parsed.data);
    res.json(generateRouteResponseSchema.parse(generated));
  } catch (error) {
    if (error instanceof RoutingProviderError) {
      const status =
        error.kind === 'timeout' ? 504 : error.kind === 'no_route' ? 422 : 502;
      return res.status(status).json({ error: error.message });
    }
    if (error instanceof InvalidRouteError) {
      return res.status(422).json({ error: error.message });
    }
    if (!sendRouteError(res, error)) next(error);
  }
});

/**
 * @swagger
 * /v2/routes/stops:
 *   post:
 *     summary: Stops along a route that is not saved
 *     description: >
 *       Drinking water, toilets, cafes and viewpoints within 150 m of the
 *       given line, from the Overpass provider the person (or the admin, or a
 *       family member who shared theirs) added in Settings > External
 *       Providers. The area around the line is sent to that server. Answers
 *       are cached for days. Any failure answers `status: "no_data"`.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ status, stops, truncated }`.'
 *       400:
 *         description: Invalid body.
 *       429:
 *         description: Too many requests.
 *       503:
 *         description: The person has no Overpass provider.
 */
router.post('/stops', async (req, res, next) => {
  try {
    const endpoint = await resolveStopsProvider(req.userId);
    if (!endpoint) {
      return res.status(503).json({
        error:
          'Stops along a route need an Overpass provider. Add one in Settings > External Providers.',
      });
    }
    const parsed = routeStopsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const retryAfter = stopsRateLimiter.hit(req.userId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many requests. Try again shortly.' });
    }
    const stops = await getStopsAlongRoute(endpoint, parsed.data.points);
    res.json(routeStopsResponseSchema.parse(stops));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/routes/{id}/stops:
 *   get:
 *     summary: Stops along a saved route
 *     description: >
 *       As `POST /v2/routes/stops`, for a route the person saved. One
 *       Overpass query per route is cached for days.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ status, stops, truncated }`.'
 *       404:
 *         description: Not found.
 *       429:
 *         description: Too many requests.
 *       503:
 *         description: The person has no Overpass provider.
 */
router.get('/:id/stops', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const endpoint = await resolveStopsProvider(req.userId);
    if (!endpoint) {
      return res.status(503).json({
        error:
          'Stops along a route need an Overpass provider. Add one in Settings > External Providers.',
      });
    }
    const retryAfter = stopsRateLimiter.hit(req.userId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many requests. Try again shortly.' });
    }
    const route = await getRoute(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!route) return res.status(404).json({ error: 'Route not found' });
    const stops = await getStopsAlongRoute(endpoint, route.points);
    res.json(routeStopsResponseSchema.parse(stops));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/routes/{id}:
 *   get:
 *     summary: Get a saved route with its points and cues
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The route.
 *       404:
 *         description: Not found.
 *   patch:
 *     summary: Rename a route, change its activity or replace its line (points and cues)
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The updated route.
 *       404:
 *         description: Not found.
 *   delete:
 *     summary: Delete a route
 *     tags: [Exercise]
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: Not found.
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const route = await getRoute(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json({ route });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const parsed = updateRouteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const route = await updateRoute(
      req.userId,
      req.params.id,
      parsed.data,
      req.authenticatedUserId
    );
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json({ route });
  } catch (error) {
    if (!sendRouteError(res, error)) next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const deleted = await deleteRoute(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!deleted) return res.status(404).json({ error: 'Route not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/routes/{id}/gpx:
 *   get:
 *     summary: Download a route as a GPX file
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The GPX file.
 *         content:
 *           application/gpx+xml: {}
 *       404:
 *         description: Not found.
 */
router.get('/:id/gpx', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const route = await getRoute(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!route) return res.status(404).json({ error: 'Route not found' });
    const filename =
      route.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'route';
    // `attachment` encodes the name (an ASCII fallback plus `filename*`), so a
    // route named in Chinese or Cyrillic downloads instead of failing on a
    // header value Node refuses. It sets the type from the extension, so the
    // type is set after it.
    res
      .attachment(`${filename}.gpx`)
      .type('application/gpx+xml')
      .send(serializeGpx(route.name, route.points));
  } catch (error) {
    next(error);
  }
});

export default router;
