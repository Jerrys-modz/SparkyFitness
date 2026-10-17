import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes from '../routes/v2/routeRoutes.js';
import {
  createRoute,
  deleteRoute,
  getActivityTrack,
  getRoute,
  getRouteGhost,
  InvalidRouteError,
  listRouteRuns,
  listRoutes,
  RouteLimitError,
  updateRoute,
} from '../models/routeRepository.js';

vi.mock('../models/routeRepository.js', () => {
  class InvalidRouteError extends Error {}
  return {
    listRoutes: vi.fn(),
    listRouteRuns: vi.fn(),
    getRoute: vi.fn(),
    getRouteGhost: vi.fn(),
    createRoute: vi.fn(),
    updateRoute: vi.fn(),
    deleteRoute: vi.fn(),
    getActivityTrack: vi.fn(),
    InvalidRouteError,
    RouteLimitError: class RouteLimitError extends Error {},
    ActivityHasNoRouteError: class ActivityHasNoRouteError extends Error {},
  };
});

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
app.use('/api/v2/routes', routeRoutes);
app.use(errorHandler);

const ID = '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f';
const points = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
];
const route = { id: ID, name: 'Loop', points, cues: [] };

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('routes API', () => {
  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/routes');
    expect(res.status).toBe(403);
    expect(listRoutes).not.toHaveBeenCalled();
  });

  it('lists routes', async () => {
    vi.mocked(listRoutes).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/routes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ routes: [] });
  });

  it('creates a drawn route and rejects a bad body', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const ok = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ source: 'drawn', activity: 'run' }),
      actingAs
    );
    const bad = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'x', points: [points[0]] });
    expect(bad.status).toBe(400);
  });

  it('maps repository errors to statuses', async () => {
    vi.mocked(createRoute).mockRejectedValueOnce(
      new InvalidRouteError('short')
    );
    const short = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(short.status).toBe(400);
    vi.mocked(createRoute).mockRejectedValueOnce(new RouteLimitError());
    const limit = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(limit.status).toBe(409);
  });

  it('imports GPX and rejects a file without a track', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const gpx =
      '<gpx><trk><name>Trail</name><trkseg><trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trkseg></trk></gpx>';
    const ok = await request(app)
      .post('/api/v2/routes/import-gpx')
      .send({ gpx });
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ name: 'Trail', source: 'gpx' }),
      actingAs
    );
    const empty = await request(app)
      .post('/api/v2/routes/import-gpx')
      .send({ gpx: '<gpx></gpx>' });
    expect(empty.status).toBe(400);
  });

  it('saves a recorded activity as a route', async () => {
    vi.mocked(getActivityTrack).mockResolvedValueOnce({
      name: 'Morning run',
      points,
    });
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const ok = await request(app).post(`/api/v2/routes/from-activity/${ID}`);
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({
        name: 'Morning run',
        source: 'activity',
        sourceExerciseEntryId: ID,
      }),
      actingAs
    );
    vi.mocked(getActivityTrack).mockResolvedValueOnce(null);
    const none = await request(app).post(`/api/v2/routes/from-activity/${ID}`);
    expect(none.status).toBe(404);
    const badId = await request(app).post('/api/v2/routes/from-activity/nope');
    expect(badId.status).toBe(400);
  });

  it('gets, renames, deletes and exports', async () => {
    vi.mocked(getRoute).mockResolvedValue(route as never);
    expect((await request(app).get(`/api/v2/routes/${ID}`)).status).toBe(200);
    expect((await request(app).get('/api/v2/routes/not-a-uuid')).status).toBe(
      404
    );

    vi.mocked(updateRoute).mockResolvedValue(route as never);
    const patched = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ name: 'New' });
    expect(patched.status).toBe(200);
    expect(
      (await request(app).patch(`/api/v2/routes/${ID}`).send({})).status
    ).toBe(400);

    vi.mocked(deleteRoute).mockResolvedValueOnce(true);
    expect((await request(app).delete(`/api/v2/routes/${ID}`)).status).toBe(
      204
    );
    vi.mocked(deleteRoute).mockResolvedValueOnce(false);
    expect((await request(app).delete(`/api/v2/routes/${ID}`)).status).toBe(
      404
    );

    const gpx = await request(app).get(`/api/v2/routes/${ID}/gpx`);
    expect(gpx.status).toBe(200);
    expect(gpx.headers['content-type']).toContain('application/gpx+xml');
    expect(gpx.text).toContain('<trkpt lat="40" lon="-74">');
  });

  it('lists the runs that followed a route', async () => {
    const runs = [
      {
        entryId: ID,
        date: '2026-10-16',
        durationSeconds: 1500,
        distanceM: 5000,
        paceSecPerKm: 300,
        avgHeartRate: 150,
      },
    ];
    vi.mocked(listRouteRuns).mockResolvedValueOnce(runs);
    const ok = await request(app).get(`/api/v2/routes/${ID}/runs`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ runs });
    expect(listRouteRuns).toHaveBeenCalledWith('test-user-id', ID, actingAs);

    vi.mocked(listRouteRuns).mockResolvedValueOnce(null);
    expect((await request(app).get(`/api/v2/routes/${ID}/runs`)).status).toBe(
      404
    );
    expect((await request(app).get('/api/v2/routes/nope/runs')).status).toBe(
      404
    );
  });

  it('refuses the run list in a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get(`/api/v2/routes/${ID}/runs`);
    expect(res.status).toBe(403);
    expect(listRouteRuns).not.toHaveBeenCalled();
  });

  it('serves the best run as a pace line and 404s a route that is not theirs', async () => {
    const ghost = {
      entryId: 'e1',
      durationSeconds: 1490,
      intervalM: 100,
      splits: [30, 60],
      source: 'track' as const,
    };
    vi.mocked(getRouteGhost).mockResolvedValueOnce({ ghost });
    const ok = await request(app).get(`/api/v2/routes/${ID}/ghost`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ghost });
    expect(getRouteGhost).toHaveBeenCalledWith('test-user-id', ID, actingAs);

    vi.mocked(getRouteGhost).mockResolvedValueOnce({ ghost: null });
    const none = await request(app).get(`/api/v2/routes/${ID}/ghost`);
    expect(none.body).toEqual({ ghost: null });

    vi.mocked(getRouteGhost).mockResolvedValueOnce(null);
    expect((await request(app).get(`/api/v2/routes/${ID}/ghost`)).status).toBe(
      404
    );
    expect((await request(app).get('/api/v2/routes/nope/ghost')).status).toBe(
      404
    );
  });
});
