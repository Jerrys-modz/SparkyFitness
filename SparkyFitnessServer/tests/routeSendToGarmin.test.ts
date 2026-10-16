import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes from '../routes/v2/routeRoutes.js';
import { getRoute } from '../models/routeRepository.js';
import garminConnectService, {
  GarminCourseError,
} from '../integrations/garminconnect/garminConnectService.js';

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
vi.mock('../integrations/garminconnect/garminConnectService.js', () => {
  class GarminCourseError extends Error {
    constructor(
      readonly failure: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    GarminCourseError,
    default: { sendRouteToGarmin: vi.fn() },
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
const route = {
  id: ID,
  name: 'Loop',
  activity: 'run',
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  cues: [{ index: 1, kind: 'left' }],
};
const url = `/api/v2/routes/${ID}/send-to-garmin`;

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
  vi.mocked(getRoute).mockResolvedValue(route as never);
});

describe('POST /api/v2/routes/:id/send-to-garmin', () => {
  it('sends the owner’s route to Garmin', async () => {
    vi.mocked(garminConnectService.sendRouteToGarmin).mockResolvedValue({
      status: 'sent',
      format: 'fit',
      courseId: 7,
    });
    const res = await request(app).post(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'sent', format: 'fit', courseId: 7 });
    expect(getRoute).toHaveBeenCalledWith('test-user-id', ID, 'test-user-id');
    expect(garminConnectService.sendRouteToGarmin).toHaveBeenCalledWith(
      'test-user-id',
      route
    );
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).post(url);
    expect(res.status).toBe(403);
    expect(garminConnectService.sendRouteToGarmin).not.toHaveBeenCalled();
  });

  it('404s for a missing route or a malformed id', async () => {
    vi.mocked(getRoute).mockResolvedValue(null);
    expect((await request(app).post(url)).status).toBe(404);
    const bad = await request(app).post('/api/v2/routes/nope/send-to-garmin');
    expect(bad.status).toBe(404);
    expect(garminConnectService.sendRouteToGarmin).not.toHaveBeenCalled();
  });

  it.each([
    ['not_linked', 409],
    ['auth', 424],
    ['rate_limited', 429],
    ['rejected', 502],
    ['unavailable', 503],
  ])('maps a %s failure to %i', async (failure, status) => {
    vi.mocked(garminConnectService.sendRouteToGarmin).mockRejectedValue(
      new GarminCourseError(failure as never, 'because')
    );
    const res = await request(app).post(url);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: 'because' });
  });

  it('passes unexpected errors to the error handler', async () => {
    vi.mocked(garminConnectService.sendRouteToGarmin).mockRejectedValue(
      new Error('boom')
    );
    expect((await request(app).post(url)).status).toBe(500);
  });
});
