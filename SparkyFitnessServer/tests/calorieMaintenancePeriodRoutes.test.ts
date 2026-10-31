import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import calorieMaintenancePeriodRoutes from '../routes/v2/calorieMaintenancePeriodRoutes.js';
import repo from '../models/calorieMaintenancePeriodRepository.js';

vi.mock('../models/calorieMaintenancePeriodRepository.js', () => ({
  default: {
    getCalorieMaintenancePeriods: vi.fn(),
    createCalorieMaintenancePeriod: vi.fn(),
    deleteCalorieMaintenancePeriod: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/calorie-maintenance-periods', calorieMaintenancePeriodRoutes);
app.use(errorHandler);

const URL = '/api/v2/calorie-maintenance-periods';
const period = {
  id: uuidv4(),
  kind: 'diet_break' as const,
  start_date: '2026-11-01',
  end_date: '2026-11-14',
  note: null,
};

describe('Calorie maintenance period routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the periods in a range', async () => {
    vi.mocked(repo.getCalorieMaintenancePeriods).mockResolvedValue([period]);
    const res = await request(app).get(`${URL}?from=2026-11-01&to=2026-11-30`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ periods: [period] });
    expect(repo.getCalorieMaintenancePeriods).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      '2026-11-01',
      '2026-11-30'
    );
  });

  it('rejects a range that is not a day', async () => {
    const res = await request(app).get(`${URL}?from=tomorrow`);
    expect(res.statusCode).toBe(400);
    expect(repo.getCalorieMaintenancePeriods).not.toHaveBeenCalled();
  });

  it('creates a diet break', async () => {
    vi.mocked(repo.createCalorieMaintenancePeriod).mockResolvedValue(period);
    const body = {
      kind: 'diet_break',
      start_date: '2026-11-01',
      end_date: '2026-11-14',
    };
    const res = await request(app).post(URL).send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(period);
    expect(repo.createCalorieMaintenancePeriod).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      body
    );
  });

  it('refuses a refeed spanning two days and a break over 28 days', async () => {
    const refeed = await request(app).post(URL).send({
      kind: 'refeed_day',
      start_date: '2026-11-01',
      end_date: '2026-11-02',
    });
    const long = await request(app).post(URL).send({
      kind: 'diet_break',
      start_date: '2026-11-01',
      end_date: '2026-12-01',
    });
    expect(refeed.statusCode).toBe(400);
    expect(long.statusCode).toBe(400);
    expect(repo.createCalorieMaintenancePeriod).not.toHaveBeenCalled();
  });

  it('deletes a period, 404 when it is not there, 400 for a bad id', async () => {
    vi.mocked(repo.deleteCalorieMaintenancePeriod).mockResolvedValueOnce(true);
    expect((await request(app).delete(`${URL}/${period.id}`)).statusCode).toBe(
      204
    );
    vi.mocked(repo.deleteCalorieMaintenancePeriod).mockResolvedValueOnce(false);
    expect((await request(app).delete(`${URL}/${period.id}`)).statusCode).toBe(
      404
    );
    expect((await request(app).delete(`${URL}/nope`)).statusCode).toBe(400);
  });
});
