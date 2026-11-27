import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import errorHandler from '../middleware/errorHandler.js';
import genericHealthRoutes from '../routes/genericHealthRoutes.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () => (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'America/New_York'),
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({}));
vi.mock('../models/genericHealthRepository.js', () => ({
  createManualBloodPressure: vi.fn(),
  updateBloodPressure: vi.fn(),
  deleteBloodPressure: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.userId = 'user-1';
  next();
});
app.use('/api/generic-health', genericHealthRoutes);
app.use(errorHandler);

const create = vi.mocked(genericHealthRepo.createManualBloodPressure);
const update = vi.mocked(genericHealthRepo.updateBloodPressure);
const remove = vi.mocked(genericHealthRepo.deleteBloodPressure);
const URL = '/api/generic-health/vitals/blood-pressure';

beforeEach(() => vi.clearAllMocks());

describe('POST /vitals/blood-pressure', () => {
  it('stores the reading on the day in the user timezone', async () => {
    create.mockResolvedValue({
      status: 'ok',
      entry: { id: 'v1' } as never,
    });
    const res = await request(app).post(URL).send({
      timestamp: '2026-11-20T03:30:00.000Z',
      systolic_mmhg: 122,
      diastolic_mmhg: 79,
      pulse_bpm: 64,
      arm: 'left',
      body_position: 'sitting',
    });
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        entry_date: '2026-11-19',
        systolic_mmhg: 122,
        diastolic_mmhg: 79,
        arm: 'left',
      })
    );
  });

  it('rejects an invalid reading', async () => {
    const res = await request(app)
      .post(URL)
      .send({ systolic_mmhg: 70, diastolic_mmhg: 90 });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 409 for a repeat at the same time', async () => {
    create.mockResolvedValue({ status: 'duplicate' });
    const res = await request(app)
      .post(URL)
      .send({ systolic_mmhg: 120, diastolic_mmhg: 80 });
    expect(res.status).toBe(409);
  });
});

describe('POST future readings', () => {
  it('refuses a reading stamped in the future', async () => {
    const res = await request(app)
      .post(URL)
      .send({
        timestamp: new Date(Date.now() + 3_600_000).toISOString(),
        systolic_mmhg: 120,
        diastolic_mmhg: 80,
      });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PUT /vitals/blood-pressure/:id', () => {
  it('updates a manual reading', async () => {
    update.mockResolvedValue({ status: 'ok', entry: { id: 'v1' } as never });
    const res = await request(app).put(`${URL}/v1`).send({ note: 'after run' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'v1',
      'user-1',
      'user-1',
      expect.objectContaining({ note: 'after run' })
    );
  });

  it('refuses synced readings with 409 and unknown ids with 404', async () => {
    update.mockResolvedValueOnce({ status: 'not_editable' });
    expect(
      (await request(app).put(`${URL}/v1`).send({ note: 'x' })).status
    ).toBe(409);
    update.mockResolvedValueOnce({ status: 'not_found' });
    expect(
      (await request(app).put(`${URL}/v2`).send({ note: 'x' })).status
    ).toBe(404);
  });

  it('answers 400 when the change would leave systolic not above diastolic', async () => {
    update.mockResolvedValueOnce({
      status: 'invalid',
      reason: 'Systolic must be higher than diastolic',
    });
    const res = await request(app).put(`${URL}/v1`).send({ systolic_mmhg: 70 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Systolic must be higher');
  });

  it('refuses a new time in the future', async () => {
    const res = await request(app)
      .put(`${URL}/v1`)
      .send({ timestamp: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /vitals/blood-pressure/:id', () => {
  it('deletes or reports not found', async () => {
    remove.mockResolvedValueOnce(true);
    expect((await request(app).delete(`${URL}/v1`)).status).toBe(200);
    remove.mockResolvedValueOnce(false);
    expect((await request(app).delete(`${URL}/v9`)).status).toBe(404);
  });
});
