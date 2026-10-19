import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import heatmapRoutes, {
  heatmapRateLimiter,
  heatmapTracksRateLimiter,
} from '../routes/v2/heatmapRoutes.js';
import { getHeatmap, getHeatmapTracks } from '../services/heatmapService.js';

vi.mock('../services/heatmapService.js', () => ({
  getHeatmap: vi.fn(),
  getHeatmapTracks: vi.fn(),
}));

let actingAs = 'test-user-id';
const app = express();
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/heatmap', heatmapRoutes);
app.use(errorHandler);

const empty = {
  cellM: 25,
  cells: [],
  maxCount: 0,
  activityCount: 0,
  truncated: false,
  bounds: null,
  firstDate: null,
  lastDate: null,
};

const noTracks = {
  tracks: [],
  pointCount: 0,
  truncated: false,
  toleranceM: 4,
};
const BOX = 'minLat=40&maxLat=41&minLon=-75&maxLon=-74';

beforeEach(() => {
  vi.clearAllMocks();
  heatmapRateLimiter.reset();
  heatmapTracksRateLimiter.reset();
  actingAs = 'test-user-id';
  vi.mocked(getHeatmap).mockResolvedValue(empty);
  vi.mocked(getHeatmapTracks).mockResolvedValue(noTracks);
});

describe('heatmap API', () => {
  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/heatmap');
    expect(res.status).toBe(403);
    expect(getHeatmap).not.toHaveBeenCalled();
  });

  it('returns the heatmap with defaults', async () => {
    const res = await request(app).get('/api/v2/heatmap');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(empty);
    expect(getHeatmap).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ maxCells: 2000 }),
      'test-user-id'
    );
  });

  it('parses filters and the viewport', async () => {
    await request(app).get(
      '/api/v2/heatmap?activities=run,ride&from=2026-01-01&to=2026-06-30&minLat=40&maxLat=41&minLon=-75&maxLon=-74&maxCells=800'
    );
    expect(getHeatmap).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({
        activities: ['run', 'ride'],
        from: '2026-01-01',
        to: '2026-06-30',
        minLat: 40,
        maxLat: 41,
        minLon: -75,
        maxLon: -74,
        maxCells: 800,
      }),
      'test-user-id'
    );
  });

  it.each([
    'activities=swim',
    'activities=',
    'from=yesterday',
    'from=2026-07-01&to=2026-01-01',
    'minLat=40',
    'minLat=42&maxLat=41&minLon=-75&maxLon=-74',
    'minLat=95&maxLat=96&minLon=0&maxLon=1',
    'maxCells=999999',
    'maxCells=3',
  ])('rejects the query %s', async (query) => {
    const res = await request(app).get(`/api/v2/heatmap?${query}`);
    expect(res.status).toBe(400);
    expect(getHeatmap).not.toHaveBeenCalled();
  });

  it('limits how often it can be asked', async () => {
    for (let i = 0; i < 120; i++) await request(app).get('/api/v2/heatmap');
    const limited = await request(app).get('/api/v2/heatmap');
    expect(limited.status).toBe(429);
  });
});

describe('heatmap tracks API', () => {
  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get(`/api/v2/heatmap/tracks?${BOX}`);
    expect(res.status).toBe(403);
    expect(getHeatmapTracks).not.toHaveBeenCalled();
  });

  it('returns the tracks with defaults', async () => {
    const res = await request(app).get(`/api/v2/heatmap/tracks?${BOX}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(noTracks);
    expect(getHeatmapTracks).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ maxTracks: 300, maxPoints: 20000 }),
      'test-user-id'
    );
  });

  it('parses filters, the box and the caps', async () => {
    await request(app).get(
      `/api/v2/heatmap/tracks?activities=run,ride&from=2026-01-01&to=2026-06-30&${BOX}&maxTracks=50&maxPoints=1000`
    );
    expect(getHeatmapTracks).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({
        activities: ['run', 'ride'],
        from: '2026-01-01',
        to: '2026-06-30',
        minLat: 40,
        maxLat: 41,
        minLon: -75,
        maxLon: -74,
        maxTracks: 50,
        maxPoints: 1000,
      }),
      'test-user-id'
    );
  });

  it.each([
    '',
    'minLat=40&maxLat=41',
    'minLat=42&maxLat=41&minLon=-75&maxLon=-74',
    'minLat=40&maxLat=41&minLon=-73&maxLon=-74',
    `${BOX}&activities=swim`,
    `${BOX}&from=2026-07-01&to=2026-01-01`,
    `${BOX}&maxTracks=601`,
    `${BOX}&maxTracks=0`,
    `${BOX}&maxPoints=40001`,
    `${BOX}&maxPoints=10`,
  ])('rejects the query %s', async (query) => {
    const res = await request(app).get(`/api/v2/heatmap/tracks?${query}`);
    expect(res.status).toBe(400);
    expect(getHeatmapTracks).not.toHaveBeenCalled();
  });

  it('limits how often it can be asked', async () => {
    for (let i = 0; i < 120; i++) {
      await request(app).get(`/api/v2/heatmap/tracks?${BOX}`);
    }
    const limited = await request(app).get(`/api/v2/heatmap/tracks?${BOX}`);
    expect(limited.status).toBe(429);
  });
});
