import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { CompareModeError, type CompareResponse } from '@workspace/shared';
import compareService from '../services/compareService.js';
import reportRoutesV2 from '../routes/v2/reportRoutes.js';

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'user-1';
    // A delegated request: the signed-in actor differs from the viewed user.
    if (req.headers['x-test-delegated']) {
      req.originalUserId = 'actor-2';
    }
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../services/compareService.js', () => ({
  default: { getCompare: vi.fn() },
}));
vi.mock('../services/alcoholWeekService.js', () => ({ default: {} }));
vi.mock('../services/hydrationNutritionRangeService.js', () => ({
  default: {},
}));
vi.mock('../models/exerciseEntry.js', () => ({ default: {} }));

const app = express();
app.use('/api/v2/reports', reportRoutesV2);

const getCompare = vi.mocked(compareService.getCompare);

const answer = { notEnough: true } as unknown as CompareResponse;

describe('GET /api/v2/reports/compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service answer for the signed-in user', async () => {
    getCompare.mockResolvedValue(answer);

    const res = await request(app).get(
      '/api/v2/reports/compare?a=timeAsleep&b=mood&start=2026-08-01&end=2026-09-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(answer);
    expect(getCompare).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        a: 'timeAsleep',
        b: 'mood',
        mode: 'day',
        timing: 0,
        start: '2026-08-01',
        end: '2026-09-30',
      })
    );
  });

  it('rejects a delegated (on-behalf-of) request', async () => {
    const res = await request(app)
      .get(
        '/api/v2/reports/compare?a=timeAsleep&b=mood&start=2026-08-01&end=2026-09-30'
      )
      .set('x-test-delegated', '1');

    expect(res.statusCode).toBe(403);
    expect(getCompare).not.toHaveBeenCalled();
  });

  it('400 for an unknown metric', async () => {
    const res = await request(app).get(
      '/api/v2/reports/compare?a=nope&b=mood&start=2026-08-01&end=2026-09-30'
    );
    expect(res.statusCode).toBe(400);
    expect(getCompare).not.toHaveBeenCalled();
  });

  it('400 for a 200-day day span', async () => {
    const res = await request(app).get(
      '/api/v2/reports/compare?a=timeAsleep&b=mood&start=2026-01-01&end=2026-07-19'
    );
    expect(res.statusCode).toBe(400);
    expect(getCompare).not.toHaveBeenCalled();
  });

  it('400 for a metric not offered in week mode', async () => {
    const res = await request(app).get(
      '/api/v2/reports/compare?a=mood&b=meditationSessions7d&mode=week&start=2026-01-05&end=2026-06-28'
    );
    expect(res.statusCode).toBe(400);
    expect(getCompare).not.toHaveBeenCalled();
  });

  it('400 when the service rejects a metric for the mode', async () => {
    getCompare.mockRejectedValue(
      new CompareModeError('not offered in week mode')
    );
    const res = await request(app).get(
      '/api/v2/reports/compare?a=timeAsleep&b=mood&start=2026-08-01&end=2026-09-30'
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'not offered in week mode' });
  });

  it('passes any other RangeError on to the error handler', async () => {
    getCompare.mockRejectedValue(new RangeError('Invalid time value'));
    const res = await request(app).get(
      '/api/v2/reports/compare?a=timeAsleep&b=mood&start=2026-08-01&end=2026-09-30'
    );
    expect(res.statusCode).toBe(500);
  });
});
