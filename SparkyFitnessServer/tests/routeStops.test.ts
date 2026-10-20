import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes, { stopsRateLimiter } from '../routes/v2/routeRoutes.js';
import { getRoute } from '../models/routeRepository.js';
import {
  STOPS_CACHE_TTL_MS,
  STOPS_FAILURE_TTL_MS,
  STOPS_MAX_ROUTE_M,
  buildStopsQuery,
  clearRouteStopsCache,
  getStopsAlongRoute,
  overpassRateLimiter,
  parseStopsResponse,
} from '../services/routeStopsService.js';

vi.mock('../models/routeRepository.js', () => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  getActivityTrack: vi.fn(),
  InvalidRouteError: class InvalidRouteError extends Error {},
  RouteLimitError: class RouteLimitError extends Error {},
  ActivityHasNoRouteError: class ActivityHasNoRouteError extends Error {},
}));
vi.mock('../models/externalProviderRepository.js', () => ({
  default: { getActiveProviderWithKeyByType: vi.fn(async () => null) },
}));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});

const post = vi.mocked(axios.post);
const URL = 'https://overpass.example/api/interpreter';

/** About 2.2 km due north from the origin. */
const ROUTE = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
  { lat: 40.02, lon: -74 },
];

const overpassAnswer = {
  data: {
    elements: [
      {
        type: 'node',
        lat: 40.0101,
        lon: -74.0005,
        tags: { amenity: 'drinking_water' },
      },
      {
        type: 'way',
        center: { lat: 40.0005, lon: -74.0003 },
        tags: { amenity: 'cafe', name: 'Corner Cafe' },
      },
      {
        type: 'node',
        lat: 40.015,
        lon: -74.0002,
        tags: { amenity: 'toilets', access: 'private' },
      },
      {
        type: 'node',
        lat: 40.02,
        lon: -74.0004,
        tags: { tourism: 'viewpoint' },
      },
      // Well off the 150 m corridor: dropped when located.
      { type: 'node', lat: 40.01, lon: -74.01, tags: { amenity: 'toilets' } },
    ],
  },
};

describe('parseStopsResponse', () => {
  it('keeps the four kinds, skips private and unreadable ones', () => {
    const read = parseStopsResponse(overpassAnswer.data);
    expect(read?.candidates.map((c) => c.kind)).toEqual([
      'water',
      'cafe',
      'viewpoint',
      'toilets',
    ]);
    expect(read?.candidates[1].name).toBe('Corner Cafe');
    expect(read?.candidates[1]).toMatchObject({ lat: 40.0005, lon: -74.0003 });
  });

  it('refuses an answer with a remark, or one that is not Overpass JSON', () => {
    expect(
      parseStopsResponse({ elements: [], remark: 'runtime error: timeout' })
    ).toBeNull();
    expect(parseStopsResponse('<html>busy</html>')).toBeNull();
  });

  it('skips drinking water marked as not drinkable', () => {
    const read = parseStopsResponse({
      elements: [
        {
          lat: 1,
          lon: 1,
          tags: { amenity: 'drinking_water', drinking_water: 'no' },
        },
      ],
    });
    expect(read?.candidates).toEqual([]);
  });
});

describe('buildStopsQuery', () => {
  it('is a bounded corridor query with a timeout and an element cap', () => {
    const query = buildStopsQuery(ROUTE);
    expect(query).toContain('[out:json][timeout:');
    expect(query).toContain('around:150,40.0000,-74.0000');
    expect(query).toMatch(/out tags center 300;$/);
  });

  it('thins a long route so the query stays small', () => {
    const long = Array.from({ length: 1500 }, (_, i) => ({
      lat: 40 + i * 0.0001,
      lon: -74 + Math.sin(i / 20) * 0.001,
    }));
    const pairs = buildStopsQuery(long).match(/-?\d+\.\d{4},-?\d+\.\d{4}/g);
    expect(pairs!.length).toBeLessThanOrEqual(60);
  });
});

describe('getStopsAlongRoute', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    post.mockReset();
    clearRouteStopsCache();
    overpassRateLimiter.reset();
    process.env.SPARKY_FITNESS_OVERPASS_URL = URL;
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.useRealTimers();
  });

  it('is off without a URL and never calls out', async () => {
    delete process.env.SPARKY_FITNESS_OVERPASS_URL;
    expect((await getStopsAlongRoute(ROUTE)).status).toBe('no_data');
    process.env.SPARKY_FITNESS_OVERPASS_URL = 'file:///etc/passwd';
    expect((await getStopsAlongRoute(ROUTE)).status).toBe('no_data');
    expect(post).not.toHaveBeenCalled();
  });

  it('places stops along the route in order and identifies the app', async () => {
    post.mockResolvedValue(overpassAnswer);
    const result = await getStopsAlongRoute(ROUTE);
    expect(result.status).toBe('ok');
    expect(result.stops.map((s) => s.kind)).toEqual([
      'cafe',
      'water',
      'viewpoint',
    ]);
    expect(result.stops[0].distanceFromStartM).toBeLessThan(
      result.stops[1].distanceFromStartM
    );
    expect(result.stops.every((s) => s.offRouteM <= 150)).toBe(true);
    expect(result.truncated).toBe(false);

    const [url, form, config] = post.mock.calls[0] as [string, string, any];
    expect(url).toBe(URL);
    expect(new URLSearchParams(form).get('data')).toContain('around:150');
    expect(config.headers['User-Agent']).toMatch(
      /^sparkyfitnessserver\/\S+ \(.*github\.com/
    );
    expect(config.timeout).toBeLessThanOrEqual(15_000);
    expect(config.maxContentLength).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(config.maxRedirects).toBe(0);
  });

  it('asks once per route and reuses the answer for days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    post.mockResolvedValue(overpassAnswer);
    await getStopsAlongRoute(ROUTE);
    await getStopsAlongRoute(ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STOPS_CACHE_TTL_MS - 1000);
    await getStopsAlongRoute(ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    await getStopsAlongRoute(ROUTE);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('shares one query between simultaneous lookups', async () => {
    post.mockResolvedValue(overpassAnswer);
    await Promise.all([getStopsAlongRoute(ROUTE), getStopsAlongRoute(ROUTE)]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unreachable', () => post.mockRejectedValue(new Error('ECONNREFUSED'))],
    [
      'timeout',
      () =>
        post.mockRejectedValue(
          Object.assign(new Error('t'), { code: 'ECONNABORTED' })
        ),
    ],
    ['garbage', () => post.mockResolvedValue({ data: 'busy' })],
    [
      'server remark',
      () =>
        post.mockResolvedValue({
          data: { elements: [], remark: 'runtime error' },
        }),
    ],
  ])('degrades to no data when the endpoint is %s', async (_name, arrange) => {
    arrange();
    await expect(getStopsAlongRoute(ROUTE)).resolves.toEqual({
      status: 'no_data',
      stops: [],
      truncated: false,
    });
  });

  it('remembers a failure only briefly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    post.mockRejectedValue(new Error('down'));
    await getStopsAlongRoute(ROUTE);
    await getStopsAlongRoute(ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STOPS_FAILURE_TTL_MS + 1000);
    post.mockResolvedValue(overpassAnswer);
    expect((await getStopsAlongRoute(ROUTE)).status).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not query for a route too long to be worth it', async () => {
    const huge = [
      { lat: 40, lon: -74 },
      { lat: 40 + (STOPS_MAX_ROUTE_M / 111_000) * 1.2, lon: -74 },
    ];
    expect((await getStopsAlongRoute(huge)).status).toBe('no_data');
    expect(post).not.toHaveBeenCalled();
  });

  it('stops asking once the server-wide budget is used up', async () => {
    post.mockResolvedValue(overpassAnswer);
    for (let i = 0; i < 20; i++) {
      await getStopsAlongRoute([
        { lat: 40 + i * 0.5, lon: -74 },
        { lat: 40.01 + i * 0.5, lon: -74 },
      ]);
    }
    expect(post).toHaveBeenCalledTimes(20);
    const over = await getStopsAlongRoute([
      { lat: 10, lon: 10 },
      { lat: 10.01, lon: 10 },
    ]);
    expect(over.status).toBe('no_data');
    expect(post).toHaveBeenCalledTimes(20);
  });

  it('marks a capped answer as truncated', async () => {
    post.mockResolvedValue({
      data: {
        elements: Array.from({ length: 300 }, (_, i) => ({
          lat: 40.0001 + i * 0.00001,
          lon: -74.0001,
          tags: { amenity: 'cafe' },
        })),
      },
    });
    const result = await getStopsAlongRoute(ROUTE);
    expect(result.truncated).toBe(true);
    expect(result.stops.length).toBeLessThanOrEqual(150);
  });
});

describe('route stops endpoints', () => {
  const saved = { ...process.env };
  let actingAs = 'test-user-id';
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next: express.NextFunction) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  });
  app.use('/api/v2/routes', routeRoutes);
  app.use(errorHandler);

  const ID = '0b6b0c36-6d0e-4b0e-9c79-0d2f6f7a1a11';

  beforeEach(() => {
    post.mockReset();
    clearRouteStopsCache();
    overpassRateLimiter.reset();
    stopsRateLimiter.reset();
    vi.mocked(getRoute).mockReset();
    actingAs = 'test-user-id';
    process.env.SPARKY_FITNESS_OVERPASS_URL = URL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('advertises stops only when an endpoint is configured', async () => {
    let res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body.stops).toBe(true);
    delete process.env.SPARKY_FITNESS_OVERPASS_URL;
    res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body.stops).toBe(false);
  });

  it('answers 503 when not configured', async () => {
    delete process.env.SPARKY_FITNESS_OVERPASS_URL;
    expect((await request(app).get(`/api/v2/routes/${ID}/stops`)).status).toBe(
      503
    );
    expect(
      (await request(app).post('/api/v2/routes/stops').send({ points: ROUTE }))
        .status
    ).toBe(503);
  });

  it('returns the stops along a saved route', async () => {
    vi.mocked(getRoute).mockResolvedValue({ id: ID, points: ROUTE } as never);
    post.mockResolvedValue(overpassAnswer);
    const res = await request(app).get(`/api/v2/routes/${ID}/stops`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.stops).toHaveLength(3);
    expect(getRoute).toHaveBeenCalledWith('test-user-id', ID, 'test-user-id');
  });

  it('404s for a bad id or a route that is not the person’s', async () => {
    expect((await request(app).get('/api/v2/routes/nope/stops')).status).toBe(
      404
    );
    vi.mocked(getRoute).mockResolvedValue(null);
    expect((await request(app).get(`/api/v2/routes/${ID}/stops`)).status).toBe(
      404
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('answers a saved route 200 with no data when Overpass is down', async () => {
    vi.mocked(getRoute).mockResolvedValue({ id: ID, points: ROUTE } as never);
    post.mockRejectedValue(new Error('down'));
    const res = await request(app).get(`/api/v2/routes/${ID}/stops`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'no_data',
      stops: [],
      truncated: false,
    });
  });

  it('looks up stops for a route that is not saved', async () => {
    post.mockResolvedValue(overpassAnswer);
    const res = await request(app)
      .post('/api/v2/routes/stops')
      .send({ points: ROUTE });
    expect(res.status).toBe(200);
    expect(res.body.stops.length).toBeGreaterThan(0);
  });

  it('rejects a body with fewer than two points', async () => {
    const res = await request(app)
      .post('/api/v2/routes/stops')
      .send({ points: [ROUTE[0]] });
    expect(res.status).toBe(400);
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    expect((await request(app).get(`/api/v2/routes/${ID}/stops`)).status).toBe(
      403
    );
  });

  it('rate limits per user', async () => {
    vi.mocked(getRoute).mockResolvedValue({ id: ID, points: ROUTE } as never);
    post.mockResolvedValue(overpassAnswer);
    for (let i = 0; i < 60; i++) {
      expect(
        (await request(app).get(`/api/v2/routes/${ID}/stops`)).status
      ).toBe(200);
    }
    const res = await request(app).get(`/api/v2/routes/${ID}/stops`);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
