import express from 'express';
import {
  heatmapQuerySchema,
  heatmapTracksQuerySchema,
} from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import { getHeatmap, getHeatmapTracks } from '../../services/heatmapService.js';
import { createUserRateLimiter } from '../../utils/userRateLimiter.js';

/**
 * The person's own heatmap. Owner-only and never delegated or shared: it
 * shows everywhere someone has run, walked or ridden.
 */
const router = express.Router();

router.use(requireSelfActor);

export const HEATMAP_RATE_LIMIT_MAX = 120;
export const HEATMAP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const heatmapRateLimiter = createUserRateLimiter(
  HEATMAP_RATE_LIMIT_MAX,
  HEATMAP_RATE_LIMIT_WINDOW_MS
);

export const heatmapTracksRateLimiter = createUserRateLimiter(
  HEATMAP_RATE_LIMIT_MAX,
  HEATMAP_RATE_LIMIT_WINDOW_MS
);

/**
 * @swagger
 * /v2/heatmap/tracks:
 *   get:
 *     summary: The person's own simplified tracks inside a map box
 *     description: >
 *       For drawing street-level lines. The same `activities` and `from`/`to`
 *       filters as the grid, and the four box corners (all required). Each
 *       track is a list of parts, each part a list of `[lat, lon]`, simplified
 *       to a few metres. At most `maxTracks` (300 by default, 600 at most) and
 *       `maxPoints` (20000 by default, 40000 at most) come back, newest first;
 *       `truncated` says some were left out. Owner-only; 120 requests per
 *       user per 10 minutes.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The tracks.
 *       400:
 *         description: Invalid query.
 *       429:
 *         description: Too many requests.
 */
router.get('/tracks', async (req, res, next) => {
  try {
    const parsed = heatmapTracksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: parsed.error.format(),
      });
    }
    const wait = heatmapTracksRateLimiter.hit(req.userId);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many requests' });
    }
    res.json(
      await getHeatmapTracks(req.userId, parsed.data, req.authenticatedUserId)
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/heatmap:
 *   get:
 *     summary: Where the person has run, walked or ridden
 *     description: >
 *       A density grid built from the person's stored GPS tracks: each cell
 *       counts the activities that passed through it. `activities` (comma
 *       list of run, walk, ride, hike; all when omitted) and `from`/`to`
 *       (`YYYY-MM-DD`) filter; the four viewport corners (all or none) cut the
 *       map to a view and the cell size grows to keep the response under
 *       `maxCells` (2000 by default, 5000 at most). Cells are
 *       `[lat, lon, count]` at the cell centre. The per-person grid is cached
 *       until their tracks change. Owner-only; 120 requests per user per 10
 *       minutes.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The grid slice.
 *       400:
 *         description: Invalid query.
 *       429:
 *         description: Too many requests.
 */
router.get('/', async (req, res, next) => {
  try {
    const parsed = heatmapQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: parsed.error.format(),
      });
    }
    const wait = heatmapRateLimiter.hit(req.userId);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const heatmap = await getHeatmap(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.json(heatmap);
  } catch (error) {
    next(error);
  }
});

export default router;
