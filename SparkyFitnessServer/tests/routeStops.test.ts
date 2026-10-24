import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes, {
  generateRateLimiter,
  stopsRateLimiter,
} from '../routes/v2/routeRoutes.js';
import { getRoute } from '../models/routeRepository.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import {
  STOPS_BACKOFF_MS,
  STOPS_CACHE_TTL_MS,
  STOPS_FAILURE_TTL_MS,
  STOPS_MAX_QUEUED,
  STOPS_MAX_ROUTE_M,
  buildStopsQuery,
  clearRouteStopsCache,
  getStopsAlongRoute,
  overpassRateLimiter,
  parseStopsResponse,
} from '../services/routeStopsService.js';
import { resolveStopsProvider } from '../services/routeStopsConfig.js';

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
  default: { getActiveProviderWithKeyByType: vi.fn() },
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdminByUserId: vi.fn(),
}));
// The real admin-toggle lookup reads the database; the derived policy is the
// same rule without it.
vi.mock('../utils/outboundUrlPolicy.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/outboundUrlPolicy.js')>();
  return {
    ...actual,
    resolveFoodProviderNetworkPolicy: async (isAdmin: boolean) =>
      actual.deriveFoodProviderNetworkPolicy(isAdmin),
  };
});
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});

const post = vi.mocked(axios.post);
const lookup = vi.mocked(
  externalProviderRepository.getActiveProviderWithKeyByType
);
const isAdmin = vi.mocked(resolveIsAdminByUserId);
const URL = 'https://overpass.example/api/interpreter';
/** What the resolver hands the service. */
const ENDPOINT = { url: URL };

function overpassRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op1',
    user_id: 'test-user-id',
    provider_name: 'Overpass',
    base_url: URL,
    app_key: null,
    ...overrides,
  };
}

/** Only the Overpass type resolves; the routing type has no provider here. */
function provideOverpass(row: ReturnType<typeof overpassRow> | null) {
  lookup.mockImplementation(async (_user, type) =>
    type === 'overpass' ? row : null
  );
}

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
  beforeEach(() => {
    post.mockReset();
    clearRouteStopsCache();
    overpassRateLimiter.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing for fewer than two points', async () => {
    expect((await getStopsAlongRoute(ENDPOINT, [ROUTE[0]])).status).toBe(
      'no_data'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('places stops along the route in order and identifies the app', async () => {
    post.mockResolvedValue(overpassAnswer);
    const result = await getStopsAlongRoute(ENDPOINT, ROUTE);
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

    const [url, form, config] = post.mock.calls[0] as [
      string,
      string,
      {
        headers: Record<string, string>;
        timeout: number;
        maxContentLength: number;
        maxRedirects: number;
      },
    ];
    expect(url).toBe(URL);
    expect(new URLSearchParams(form).get('data')).toContain('around:150');
    expect(config.headers['User-Agent']).toMatch(
      /^SparkyFitness\/\S+ \(route stops; https:\/\/github\.com/
    );
    expect(config.timeout).toBeLessThanOrEqual(15_000);
    expect(config.maxContentLength).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(config.maxRedirects).toBe(0);
  });

  it('guards name resolution when the owner may not use the LAN', async () => {
    post.mockResolvedValue(overpassAnswer);
    const guarded = vi.fn();
    await getStopsAlongRoute({ url: URL, lookup: guarded }, ROUTE);
    const config = post.mock.calls[0][2] as {
      httpsAgent?: { options: { lookup?: unknown } };
    };
    expect(config.httpsAgent?.options.lookup).toBe(guarded);
  });

  it('asks once per route and reuses the answer for days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    post.mockResolvedValue(overpassAnswer);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STOPS_CACHE_TTL_MS - 1000);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not share answers between endpoints', async () => {
    post.mockResolvedValue(overpassAnswer);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    await getStopsAlongRoute({ url: 'https://other.example/api' }, ROUTE);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('shares one query between simultaneous lookups', async () => {
    post.mockResolvedValue(overpassAnswer);
    await Promise.all([
      getStopsAlongRoute(ENDPOINT, ROUTE),
      getStopsAlongRoute(ENDPOINT, ROUTE),
    ]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never runs two different lookups to one endpoint at once', async () => {
    let running = 0;
    let peak = 0;
    post.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return overpassAnswer;
    });
    const routes = Array.from({ length: 4 }, (_, i) => [
      { lat: 40 + i, lon: -74 },
      { lat: 40.01 + i, lon: -74 },
    ]);
    const results = await Promise.all(
      routes.map((r) => getStopsAlongRoute(ENDPOINT, r))
    );
    expect(post).toHaveBeenCalledTimes(4);
    expect(peak).toBe(1);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('answers busy rather than queueing without limit', async () => {
    post.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(overpassAnswer), 20))
    );
    const results = await Promise.all(
      Array.from({ length: STOPS_MAX_QUEUED + 3 }, (_, i) =>
        getStopsAlongRoute(ENDPOINT, [
          { lat: 10 + i, lon: 10 },
          { lat: 10.01 + i, lon: 10 },
        ])
      )
    );
    expect(results.filter((r) => r.status === 'busy')).toHaveLength(3);
    expect(post).toHaveBeenCalledTimes(STOPS_MAX_QUEUED);
  });

  it.each([429, 406])(
    'backs off for 30 s after a %i and then asks again',
    async (status) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      post.mockRejectedValue(
        Object.assign(new Error('slow down'), {
          isAxiosError: true,
          response: { status },
        })
      );
      const first = await getStopsAlongRoute(ENDPOINT, ROUTE);
      expect(first.status).toBe('busy');
      expect(post).toHaveBeenCalledTimes(1);

      // Another route, same endpoint: not even attempted while backing off.
      vi.advanceTimersByTime(STOPS_BACKOFF_MS - 1000);
      const other = [
        { lat: 41, lon: -74 },
        { lat: 41.01, lon: -74 },
      ];
      expect((await getStopsAlongRoute(ENDPOINT, other)).status).toBe('busy');
      expect(post).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      post.mockResolvedValue(overpassAnswer);
      expect((await getStopsAlongRoute(ENDPOINT, other)).status).toBe('ok');
      expect(post).toHaveBeenCalledTimes(2);
    }
  );

  it('does not back off for other failures', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('boom'), {
        isAxiosError: true,
        response: { status: 500 },
      })
    );
    expect((await getStopsAlongRoute(ENDPOINT, ROUTE)).status).toBe('no_data');
    post.mockResolvedValue(overpassAnswer);
    clearRouteStopsCache();
    expect((await getStopsAlongRoute(ENDPOINT, ROUTE)).status).toBe('ok');
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
    await expect(getStopsAlongRoute(ENDPOINT, ROUTE)).resolves.toEqual({
      status: 'no_data',
      stops: [],
      truncated: false,
    });
  });

  it('remembers a failure only briefly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    post.mockRejectedValue(new Error('down'));
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    await getStopsAlongRoute(ENDPOINT, ROUTE);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STOPS_FAILURE_TTL_MS + 1000);
    post.mockResolvedValue(overpassAnswer);
    expect((await getStopsAlongRoute(ENDPOINT, ROUTE)).status).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not query for a route too long to be worth it', async () => {
    const huge = [
      { lat: 40, lon: -74 },
      { lat: 40 + (STOPS_MAX_ROUTE_M / 111_000) * 1.2, lon: -74 },
    ];
    expect((await getStopsAlongRoute(ENDPOINT, huge)).status).toBe('no_data');
    expect(post).not.toHaveBeenCalled();
  });

  it('stops asking once the endpoint budget is used up, as busy', async () => {
    post.mockResolvedValue(overpassAnswer);
    for (let i = 0; i < 20; i++) {
      await getStopsAlongRoute(ENDPOINT, [
        { lat: 40 + i * 0.5, lon: -74 },
        { lat: 40.01 + i * 0.5, lon: -74 },
      ]);
    }
    expect(post).toHaveBeenCalledTimes(20);
    const over = await getStopsAlongRoute(ENDPOINT, [
      { lat: 10, lon: 10 },
      { lat: 10.01, lon: 10 },
    ]);
    expect(over.status).toBe('busy');
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
    const result = await getStopsAlongRoute(ENDPOINT, ROUTE);
    expect(result.truncated).toBe(true);
    expect(result.stops.length).toBeLessThanOrEqual(150);
  });

  it('strips control characters from names and caps their length', () => {
    const read = parseStopsResponse({
      elements: [
        {
          lat: 1,
          lon: 1,
          tags: { amenity: 'cafe', name: `A\u0000B\n${'x'.repeat(500)}` },
        },
      ],
    });
    const name = read?.candidates[0].name ?? '';
    expect(name.length).toBeLessThanOrEqual(80);
    // eslint-disable-next-line no-control-regex
    expect(name).not.toMatch(/[\u0000-\u001f]/);
  });
});

// A hostile or broken Overpass server (or a huge track) must not stall the
// single Node thread. Measured at a few hundred ms or less in the sandbox;
// the bound is far above that so a slow CI runner does not flake, and far
// below what the unbounded versions take (billions of operations).
describe('stops with hostile input', () => {
  beforeEach(() => {
    post.mockReset();
    clearRouteStopsCache();
    overpassRateLimiter.reset();
  });

  it('places 100,000 stops against a 50,000-point route in bounded time', async () => {
    const track = Array.from({ length: 50_000 }, (_, i) => ({
      lat: 40 + i * 0.000002,
      lon: -74 + Math.sin(i / 50) * 0.0004,
    }));
    const elements = Array.from({ length: 100_000 }, (_, i) => ({
      lat: 40 + (i % 1000) * 0.0001,
      lon: -74 + (i % 7) * 0.00001,
      tags: { amenity: 'cafe' },
    }));
    post.mockResolvedValue({ data: { elements } });
    const started = performance.now();
    const result = await getStopsAlongRoute(ENDPOINT, track);
    const took = performance.now() - started;
    expect(result.status).toBe('ok');
    expect(result.stops.length).toBeLessThanOrEqual(150);
    expect(took).toBeLessThan(5_000);
  });

  it('reads at most the first 1,000 elements of an oversized answer', () => {
    const elements = Array.from({ length: 50_000 }, (_, i) => ({
      lat: 1,
      lon: 1 + i * 1e-6,
      tags: { amenity: 'cafe' },
    }));
    const started = performance.now();
    const read = parseStopsResponse({ elements });
    expect(read?.candidates.length).toBe(1000);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe('resolveStopsProvider', () => {
  beforeEach(() => {
    lookup.mockReset();
    isAdmin.mockReset().mockResolvedValue(true);
  });

  it('is null when the person has no Overpass provider', async () => {
    provideOverpass(null);
    expect(await resolveStopsProvider('u')).toBeNull();
    expect(lookup).toHaveBeenCalledWith('u', 'overpass');
  });

  it('uses the provider the repository resolves (own, public or shared)', async () => {
    provideOverpass(overpassRow({ user_id: 'someone-else' }));
    expect(await resolveStopsProvider('u')).toMatchObject({
      url: URL,
      source: 'provider',
    });
  });

  it('reads a scheme-less URL as https', async () => {
    provideOverpass(
      overpassRow({ base_url: 'overpass.example/api/interpreter' })
    );
    expect((await resolveStopsProvider('u'))?.url).toBe(
      'https://overpass.example/api/interpreter'
    );
  });

  it('refuses other schemes and a LAN address for a non-admin owner', async () => {
    provideOverpass(overpassRow({ base_url: 'file:///etc/passwd' }));
    expect(await resolveStopsProvider('u')).toBeNull();
    isAdmin.mockResolvedValue(false);
    provideOverpass(
      overpassRow({ base_url: 'http://10.0.0.5/api/interpreter' })
    );
    expect(await resolveStopsProvider('u')).toBeNull();
  });

  it('allows a LAN address for an admin owner, without the DNS guard', async () => {
    provideOverpass(
      overpassRow({ base_url: 'http://10.0.0.5/api/interpreter' })
    );
    const resolved = await resolveStopsProvider('u');
    expect(resolved?.url).toBe('http://10.0.0.5/api/interpreter');
    expect(resolved?.lookup).toBeUndefined();
  });

  it('is null, not an error, when the lookup fails', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    expect(await resolveStopsProvider('u')).toBeNull();
  });
});

describe('route stops endpoints', () => {
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
    generateRateLimiter.reset();
    vi.mocked(getRoute).mockReset();
    lookup.mockReset();
    provideOverpass(overpassRow());
    isAdmin.mockReset().mockResolvedValue(true);
    actingAs = 'test-user-id';
  });

  it('advertises stops only when the person has a provider', async () => {
    let res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toMatchObject({
      stops: true,
      stopsSource: 'provider',
      available: false,
      source: null,
    });
    provideOverpass(null);
    res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toMatchObject({ stops: false, stopsSource: null });
  });

  it('stops advertising stops while the endpoint asks to slow down', async () => {
    vi.mocked(getRoute).mockResolvedValue({ id: ID, points: ROUTE } as never);
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        response: { status: 429 },
      })
    );
    const busy = await request(app).get(`/api/v2/routes/${ID}/stops`);
    expect(busy.status).toBe(200);
    expect(busy.body.status).toBe('busy');
    const caps = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(caps.status).toBe(200);
    expect(caps.body).toMatchObject({ stops: false, stopsSource: null });
  });

  it('answers 503 with a pointer to Settings when there is no provider', async () => {
    provideOverpass(null);
    const saved = await request(app).get(`/api/v2/routes/${ID}/stops`);
    expect(saved.status).toBe(503);
    expect(saved.body.error).toContain('Settings > External Providers');
    expect(
      (await request(app).post('/api/v2/routes/stops').send({ points: ROUTE }))
        .status
    ).toBe(503);
    expect(post).not.toHaveBeenCalled();
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

  it('rejects a body with fewer than two points or more than 2000', async () => {
    expect(
      (
        await request(app)
          .post('/api/v2/routes/stops')
          .send({ points: [ROUTE[0]] })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v2/routes/stops')
          .send({ points: Array.from({ length: 2001 }, () => ROUTE[0]) })
      ).status
    ).toBe(400);
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
