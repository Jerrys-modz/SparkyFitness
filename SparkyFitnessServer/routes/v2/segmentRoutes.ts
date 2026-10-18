import express from 'express';
import {
  createSegmentBodySchema,
  updateSegmentBodySchema,
} from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  createSegmentFromBody,
  getEntrySegmentEfforts,
  getSegmentWithEfforts,
  InvalidSegmentError,
  matchSegmentHistory,
  SegmentSourceNotFoundError,
} from '../../services/segmentService.js';
import {
  deleteSegment,
  listSegments,
  renameSegment,
  SegmentLimitError,
} from '../../models/segmentRepository.js';
import { createUserRateLimiter } from '../../utils/userRateLimiter.js';

/**
 * A person's own segments and their own times on them. Owner-only: where
 * someone runs is personal, so a delegated context is refused outright.
 */
const router = express.Router();

router.use(requireSelfActor);

/** Matching reads stored tracks, so keep a single account from looping on it. */
export const MATCH_RATE_LIMIT_MAX = 60;
export const MATCH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const matchRateLimiter = createUserRateLimiter(
  MATCH_RATE_LIMIT_MAX,
  MATCH_RATE_LIMIT_WINDOW_MS
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): boolean => UUID.test(value);

/**
 * @swagger
 * /v2/segments:
 *   get:
 *     summary: List segments
 *     description: >
 *       The person's segments with their own best time, number of passes and
 *       the day of the last one. Personal only; there are no shared segments.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: 'The segments: `{ segments: SegmentSummary[] }`.'
 *   post:
 *     summary: Create a segment
 *     description: >
 *       `mode: "points"` takes the stretch as points (cut by the client from a
 *       route or a recorded activity); `mode: "route"` cuts a saved route
 *       between `startM` and `endM` metres from its start. Between 100 m and
 *       100 km. Matching past activities is a separate call
 *       (`POST /v2/segments/{id}/match`).
 *     tags: [Exercise]
 *     responses:
 *       201:
 *         description: The new segment summary.
 *       400:
 *         description: Invalid body or length.
 *       404:
 *         description: The source route was not found.
 *       409:
 *         description: The person has reached the segment limit.
 */
router.get('/', async (req, res, next) => {
  try {
    const segments = await listSegments(req.userId, req.authenticatedUserId);
    res.json({ segments });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSegmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const segment = await createSegmentFromBody(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.status(201).json({ segment });
  } catch (error) {
    if (error instanceof InvalidSegmentError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof SegmentSourceNotFoundError) {
      return res.status(404).json({ error: 'Route not found' });
    }
    if (error instanceof SegmentLimitError) {
      return res.status(409).json({ error: 'Segment limit reached' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/segments/entries/{entryId}/efforts:
 *   get:
 *     summary: The segments one activity ran
 *     description: >
 *       Each segment the activity's GPS track passed, with the time, and
 *       whether it is a new best against the person's other times. Segments
 *       not yet checked against the activity are matched first.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: 'The efforts: `{ efforts: EntrySegmentEffort[] }`.'
 */
router.get('/entries/:entryId/efforts', async (req, res, next) => {
  try {
    if (!isUuid(req.params.entryId)) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    const efforts = await getEntrySegmentEfforts(
      req.userId,
      req.params.entryId,
      req.authenticatedUserId
    );
    res.json({ efforts });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/segments/{id}:
 *   get:
 *     summary: One segment with the person's efforts on it
 *     description: >
 *       The segment summary and every cached pass, newest first, with the best
 *       one and each personal record marked.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ segment, efforts }`.'
 *       404:
 *         description: Not found.
 *   patch:
 *     summary: Rename a segment
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: 'The updated summary: `{ segment }`.'
 *   delete:
 *     summary: Delete a segment and its cached efforts
 *     tags: [Exercise]
 *     responses:
 *       204:
 *         description: Deleted.
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    const result = await getSegmentWithEfforts(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!result) return res.status(404).json({ error: 'Segment not found' });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/efforts', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    const result = await getSegmentWithEfforts(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!result) return res.status(404).json({ error: 'Segment not found' });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    const parsed = updateSegmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const segment = await renameSegment(
      req.userId,
      req.params.id,
      parsed.data.name ?? null,
      req.authenticatedUserId
    );
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ segment });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    const deleted = await deleteSegment(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!deleted) return res.status(404).json({ error: 'Segment not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/segments/{id}/match:
 *   post:
 *     summary: Find the person's past passes over a segment
 *     description: >
 *       Reads recorded activities whose track came near the segment and have
 *       no cached result, newest first (100 at most per call, 8 seconds), and
 *       stores a pass or a "no pass" for each. Call again while `hasMore` is
 *       true. 60 calls per user per 10 minutes.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ scanned, found, hasMore }`.'
 *       404:
 *         description: Not found.
 *       429:
 *         description: Too many requests.
 */
router.post('/:id/match', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    const wait = matchRateLimiter.hit(req.userId);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const result = await matchSegmentHistory(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!result) return res.status(404).json({ error: 'Segment not found' });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
