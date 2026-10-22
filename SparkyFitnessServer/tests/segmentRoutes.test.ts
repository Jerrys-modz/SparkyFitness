import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import segmentRoutes, { matchRateLimiter } from '../routes/v2/segmentRoutes.js';
import {
  createSegmentFromBody,
  getEntrySegmentEfforts,
  getSegmentWithEfforts,
  matchSegmentHistory,
  InvalidSegmentError,
  SegmentSourceNotFoundError,
} from '../services/segmentService.js';
import {
  deleteSegment,
  listSegments,
  renameSegment,
  SegmentLimitError,
} from '../models/segmentRepository.js';

vi.mock('../services/segmentService.js', () => {
  class InvalidSegmentError extends Error {}
  class SegmentSourceNotFoundError extends Error {}
  return {
    createSegmentFromBody: vi.fn(),
    getEntrySegmentEfforts: vi.fn(),
    getSegmentWithEfforts: vi.fn(),
    matchSegmentHistory: vi.fn(),
    InvalidSegmentError,
    SegmentSourceNotFoundError,
  };
});
vi.mock('../models/segmentRepository.js', () => ({
  listSegments: vi.fn(),
  renameSegment: vi.fn(),
  deleteSegment: vi.fn(),
  SegmentLimitError: class SegmentLimitError extends Error {},
}));

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
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
app.use('/api/v2/segments', segmentRoutes);
app.use(errorHandler);

const ID = '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f';
const ENTRY = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';
const points = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
];

beforeEach(() => {
  vi.clearAllMocks();
  matchRateLimiter.reset();
  actingAs = 'test-user-id';
});

describe('segments API', () => {
  it.each([
    ['get', '/api/v2/segments'],
    ['post', '/api/v2/segments'],
    ['get', `/api/v2/segments/${ID}`],
    ['get', `/api/v2/segments/${ID}/efforts`],
    ['post', `/api/v2/segments/${ID}/match`],
    ['get', `/api/v2/segments/entries/${ENTRY}/efforts`],
    ['delete', `/api/v2/segments/${ID}`],
  ])('refuses a delegated context on %s %s', async (method, url) => {
    actingAs = 'someone-else';
    const res = await (
      request(app) as never as Record<
        string,
        (u: string) => Promise<{ status: number }>
      >
    )[method](url);
    expect(res.status).toBe(403);
    expect(listSegments).not.toHaveBeenCalled();
    expect(createSegmentFromBody).not.toHaveBeenCalled();
    expect(matchSegmentHistory).not.toHaveBeenCalled();
  });

  it('lists segments', async () => {
    vi.mocked(listSegments).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/segments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ segments: [] });
    expect(listSegments).toHaveBeenCalledWith('test-user-id', 'test-user-id');
  });

  it('creates a segment from points and rejects a bad body', async () => {
    vi.mocked(createSegmentFromBody).mockResolvedValue({ id: ID } as never);
    const ok = await request(app)
      .post('/api/v2/segments')
      .send({ mode: 'points', points, name: 'Hill' });
    expect(ok.status).toBe(201);
    expect(createSegmentFromBody).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({
        mode: 'points',
        activity: 'run',
        name: 'Hill',
      }),
      'test-user-id'
    );
    for (const bad of [
      { mode: 'points', points: [points[0]] },
      { mode: 'route', routeId: ID, startM: 500, endM: 100 },
      { mode: 'route', routeId: 'nope', startM: 0, endM: 100 },
      { points },
      { mode: 'points', points, name: '' },
    ]) {
      const res = await request(app).post('/api/v2/segments').send(bad);
      expect(res.status).toBe(400);
    }
  });

  it('creates a segment from a stretch of a route', async () => {
    vi.mocked(createSegmentFromBody).mockResolvedValue({ id: ID } as never);
    const res = await request(app)
      .post('/api/v2/segments')
      .send({ mode: 'route', routeId: ID, startM: 100, endM: 900 });
    expect(res.status).toBe(201);
  });

  it('maps domain errors to statuses', async () => {
    vi.mocked(createSegmentFromBody).mockRejectedValueOnce(
      new InvalidSegmentError('too short')
    );
    expect(
      (
        await request(app)
          .post('/api/v2/segments')
          .send({ mode: 'points', points })
      ).status
    ).toBe(400);
    vi.mocked(createSegmentFromBody).mockRejectedValueOnce(
      new SegmentSourceNotFoundError()
    );
    expect(
      (
        await request(app)
          .post('/api/v2/segments')
          .send({ mode: 'points', points })
      ).status
    ).toBe(404);
    vi.mocked(createSegmentFromBody).mockRejectedValueOnce(
      new SegmentLimitError()
    );
    expect(
      (
        await request(app)
          .post('/api/v2/segments')
          .send({ mode: 'points', points })
      ).status
    ).toBe(409);
  });

  it('returns a segment with its efforts, or 404', async () => {
    vi.mocked(getSegmentWithEfforts).mockResolvedValueOnce({
      segment: { id: ID },
      efforts: [],
    } as never);
    const ok = await request(app).get(`/api/v2/segments/${ID}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ segment: { id: ID }, efforts: [] });
    vi.mocked(getSegmentWithEfforts).mockResolvedValueOnce(null);
    expect(
      (await request(app).get(`/api/v2/segments/${ID}/efforts`)).status
    ).toBe(404);
    expect((await request(app).get('/api/v2/segments/not-a-uuid')).status).toBe(
      404
    );
  });

  it('renames, clears the name and deletes', async () => {
    vi.mocked(renameSegment).mockResolvedValue({ id: ID } as never);
    const named = await request(app)
      .patch(`/api/v2/segments/${ID}`)
      .send({ name: 'Hill' });
    expect(named.status).toBe(200);
    expect(renameSegment).toHaveBeenLastCalledWith(
      'test-user-id',
      ID,
      'Hill',
      'test-user-id'
    );
    await request(app).patch(`/api/v2/segments/${ID}`).send({ name: null });
    expect(renameSegment).toHaveBeenLastCalledWith(
      'test-user-id',
      ID,
      null,
      'test-user-id'
    );
    expect(
      (await request(app).patch(`/api/v2/segments/${ID}`).send({})).status
    ).toBe(400);

    vi.mocked(deleteSegment)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect((await request(app).delete(`/api/v2/segments/${ID}`)).status).toBe(
      204
    );
    expect((await request(app).delete(`/api/v2/segments/${ID}`)).status).toBe(
      404
    );
  });

  it('matches history and limits how often', async () => {
    vi.mocked(matchSegmentHistory).mockResolvedValue({
      scanned: 3,
      found: 1,
      hasMore: false,
    });
    const res = await request(app).post(`/api/v2/segments/${ID}/match`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, found: 1, hasMore: false });
    for (let i = 0; i < 59; i++) {
      await request(app).post(`/api/v2/segments/${ID}/match`);
    }
    const limited = await request(app).post(`/api/v2/segments/${ID}/match`);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('answers 404 for a segment that is not theirs when matching', async () => {
    vi.mocked(matchSegmentHistory).mockResolvedValue(null);
    expect(
      (await request(app).post(`/api/v2/segments/${ID}/match`)).status
    ).toBe(404);
  });

  it("lists an activity's segment efforts", async () => {
    vi.mocked(getEntrySegmentEfforts).mockResolvedValue([]);
    const res = await request(app).get(
      `/api/v2/segments/entries/${ENTRY}/efforts`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ efforts: [] });
    expect(getEntrySegmentEfforts).toHaveBeenCalledWith(
      'test-user-id',
      ENTRY,
      'test-user-id'
    );
    expect(
      (await request(app).get('/api/v2/segments/entries/x/efforts')).status
    ).toBe(404);
  });
});
