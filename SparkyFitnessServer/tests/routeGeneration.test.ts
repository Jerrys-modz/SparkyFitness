import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes, { generateRateLimiter } from '../routes/v2/routeRoutes.js';
import { generateRoute } from '../services/routeGenerationService.js';
import { getRoutingProvider } from '../services/routing/routingConfig.js';
import {
  RoutingProviderError,
  type RoutingProvider,
  type RoutingRequest,
} from '../services/routing/routingProvider.js';
import { destinationPoint } from '../services/routing/loopPlanner.js';
import { routeDistanceMeters } from '@workspace/shared';

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
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, post: vi.fn() },
  };
});

const START = { lat: 40, lon: -74 };

/** A provider that follows the given locations in straight lines. */
function straightLineProvider(
  scale = 1,
  calls: RoutingRequest[] = []
): RoutingProvider {
  return {
    kind: 'fake',
    async route(req) {
      calls.push(req);
      const points = req.locations.map((l) => ({ ...l }));
      return {
        points,
        cues: [
          { index: 0, kind: 'depart' as const },
          { index: points.length - 1, kind: 'arrive' as const },
        ],
        distanceM: routeDistanceMeters(points) * scale,
      };
    },
  };
}

describe('generateRoute', () => {
  it('routes through waypoints in order and returns a savable preview', async () => {
    const calls: RoutingRequest[] = [];
    const waypoints = [
      { lat: 40.01, lon: -74 },
      { lat: 40.01, lon: -74.01 },
    ];
    const route = await generateRoute(straightLineProvider(1, calls), {
      mode: 'waypoints',
      start: START,
      waypoints,
      returnToStart: true,
      activity: 'walk',
    });
    expect(calls[0].locations).toEqual([START, ...waypoints, START]);
    expect(calls[0].activity).toBe('walk');
    expect(route.source).toBe('generated');
    expect(route.name).toMatch(/^Generated .* km walk$/);
    expect(route.cues.map((c) => c.kind)).toEqual(['depart', 'arrive']);
    expect(route.distanceM).toBeGreaterThan(2000);
  });

  it('uses the requested name', async () => {
    const route = await generateRoute(straightLineProvider(), {
      mode: 'waypoints',
      start: START,
      waypoints: [{ lat: 40.01, lon: -74 }],
      returnToStart: false,
      activity: 'run',
      name: 'Mine',
    });
    expect(route.name).toBe('Mine');
  });

  it('resizes a loop that comes back too long, then stops within tolerance', async () => {
    const calls: RoutingRequest[] = [];
    // The "engine" returns 1.6x the straight-line distance of what it is asked.
    const route = await generateRoute(straightLineProvider(1.6, calls), {
      mode: 'loop',
      start: START,
      distanceM: 5000,
      shape: 'loop',
      bearingDeg: 90,
      activity: 'run',
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBeLessThanOrEqual(3);
    // Loops start and end at the start point.
    expect(calls[0].locations[0]).toEqual(START);
    expect(calls[0].locations.at(-1)).toEqual(START);
    // The returned distance is the straight-line track, i.e. engine/1.6; the
    // provider-reported distance is what drives the resize.
    expect(route.distanceM).toBeGreaterThan(0);
    const last = calls.at(-1)!.locations;
    const first = calls[0].locations;
    expect(routeDistanceMeters(last)).toBeLessThan(routeDistanceMeters(first));
  });

  it('plans an out-and-back with the turnaround on the bearing', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(straightLineProvider(1.3, calls), {
      mode: 'loop',
      start: START,
      distanceM: 6000,
      shape: 'out_and_back',
      bearingDeg: 0,
      activity: 'ride',
    });
    const [from, turn, back] = calls[0].locations;
    expect(from).toEqual(START);
    expect(back).toEqual(START);
    expect(turn.lon).toBeCloseTo(START.lon, 5);
    expect(turn.lat).toBeGreaterThan(START.lat);
  });

  it('propagates provider failures', async () => {
    const provider: RoutingProvider = {
      kind: 'fake',
      route: () =>
        Promise.reject(
          new RoutingProviderError('timeout', 'The routing engine timed out')
        ),
    };
    await expect(
      generateRoute(provider, {
        mode: 'waypoints',
        start: START,
        waypoints: [{ lat: 40.01, lon: -74 }],
        returnToStart: false,
        activity: 'run',
      })
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('destinationPoint', () => {
  it('moves the requested distance', () => {
    const p = destinationPoint(START, 90, 1000);
    expect(routeDistanceMeters([START, p])).toBeCloseTo(1000, 0);
  });
});

describe('routing config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is unavailable without a URL', () => {
    delete process.env.SPARKY_FITNESS_ROUTING_URL;
    expect(getRoutingProvider()).toBeNull();
  });

  it('is unavailable for an unsupported provider or a non-http URL', () => {
    process.env.SPARKY_FITNESS_ROUTING_URL = 'http://valhalla:8002';
    process.env.SPARKY_FITNESS_ROUTING_PROVIDER = 'osrm';
    expect(getRoutingProvider()).toBeNull();
    process.env.SPARKY_FITNESS_ROUTING_PROVIDER = 'valhalla';
    process.env.SPARKY_FITNESS_ROUTING_URL = 'file:///etc/passwd';
    expect(getRoutingProvider()).toBeNull();
  });

  it('defaults to valhalla when a URL is set', () => {
    process.env.SPARKY_FITNESS_ROUTING_URL = 'http://valhalla:8002/';
    delete process.env.SPARKY_FITNESS_ROUTING_PROVIDER;
    expect(getRoutingProvider()?.kind).toBe('valhalla');
  });
});

describe('Valhalla provider over HTTP (axios mocked)', () => {
  const saved = { ...process.env };
  const post = vi.mocked(axios.post);
  beforeEach(() => {
    post.mockReset();
    process.env.SPARKY_FITNESS_ROUTING_URL = 'http://valhalla:8002/';
    process.env.SPARKY_FITNESS_ROUTING_API_KEY = 'super-secret-key';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const axiosError = (
    code: string | undefined,
    status?: number,
    data?: unknown
  ) =>
    Object.assign(new Error('boom'), {
      isAxiosError: true,
      code,
      response: status ? { status, data } : undefined,
    });

  const req: RoutingRequest = {
    locations: [START, { lat: 40.01, lon: -74 }],
    activity: 'ride',
  };

  it('sends costing, via types and the key as a param, and maps the answer', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) {
        return {
          data: {
            trip: {
              summary: { length: 1.11 },
              legs: [
                {
                  shape: '_c`|@_gayB_c`|@?',
                  maneuvers: [{ type: 1, length: 1.11, begin_shape_index: 0 }],
                },
              ],
            },
          },
        };
      }
      throw axiosError('ECONNREFUSED'); // no /height: elevation is optional
    });
    const result = await getRoutingProvider()!.route(req);
    const [url, body, config] = post.mock.calls[0] as [string, any, any];
    expect(url).toBe('http://valhalla:8002/route');
    expect(body.costing).toBe('bicycle');
    expect(config.params).toEqual({ api_key: 'super-secret-key' });
    expect(result.distanceM).toBeCloseTo(1110);
    expect(result.cues[0].kind).toBe('depart');
    expect(result.points.every((p) => p.alt === undefined)).toBe(true);
  });

  it.each([
    [axiosError('ECONNABORTED'), 'timeout'],
    [axiosError('ECONNREFUSED'), 'unreachable'],
    [axiosError(undefined, 400, { error_code: 442 }), 'no_route'],
    [axiosError(undefined, 401), 'rejected'],
    [axiosError(undefined, 503), 'unreachable'],
  ])('maps a failure to %#', async (error, kind) => {
    post.mockRejectedValue(error);
    await expect(getRoutingProvider()!.route(req)).rejects.toMatchObject({
      kind,
    });
  });

  it('never puts the API key in an error message', async () => {
    post.mockRejectedValue(axiosError(undefined, 403));
    const failure = await getRoutingProvider()!
      .route(req)
      .catch((e) => e);
    expect(String(failure.message)).not.toContain('super-secret-key');
  });

  it('rejects an unreadable response', async () => {
    post.mockResolvedValue({ data: { nope: true } });
    await expect(getRoutingProvider()!.route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });
});

describe('route generation endpoints', () => {
  const saved = { ...process.env };
  const post = vi.mocked(axios.post);
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

  const body = {
    mode: 'waypoints',
    start: START,
    waypoints: [{ lat: 40.01, lon: -74 }],
  };

  beforeEach(() => {
    post.mockReset();
    generateRateLimiter.reset();
    actingAs = 'test-user-id';
    process.env.SPARKY_FITNESS_ROUTING_URL = 'http://valhalla:8002';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const engineAnswer = {
    data: {
      trip: {
        summary: { length: 1.1 },
        legs: [
          { shape: '_c`|@_gayB_c`|@?', maneuvers: [{ type: 1, length: 1.1 }] },
        ],
      },
    },
  };

  it('reports availability from config', async () => {
    let res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toEqual({ available: true });
    delete process.env.SPARKY_FITNESS_ROUTING_URL;
    res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toEqual({ available: false });
  });

  it('returns 503 when not configured', async () => {
    delete process.env.SPARKY_FITNESS_ROUTING_URL;
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(503);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post('/api/v2/routes/generate')
      .send({ mode: 'loop', start: START, distanceM: 5 });
    expect(res.status).toBe(400);
  });

  it('returns a preview without saving', async () => {
    post.mockResolvedValue(engineAnswer);
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(200);
    expect(res.body.route.source).toBe('generated');
    expect(res.body.route.points.length).toBeGreaterThan(1);
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(403);
  });

  it.each([
    ['ECONNABORTED', undefined, 504],
    ['ECONNREFUSED', undefined, 502],
    [undefined, 401, 502],
  ])('maps provider failure %s/%s to %i', async (code, status, expected) => {
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        code,
        response: status ? { status } : undefined,
      })
    );
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(expected);
  });

  it('maps "no route" to 422', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        response: { status: 400, data: { error_code: 442 } },
      })
    );
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(422);
  });

  it('rate limits per user', async () => {
    post.mockResolvedValue(engineAnswer);
    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/api/v2/routes/generate').send(body);
      expect(ok.status).toBe(200);
    }
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
