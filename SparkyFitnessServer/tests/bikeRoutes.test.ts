import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import bikeRoutes from '../routes/v2/bikeRoutes.js';
import * as bikeRepo from '../models/bikeRepository.js';

vi.mock('../models/bikeRepository.js', () => ({
  getBikes: vi.fn(),
  getBikeById: vi.fn(),
  createBike: vi.fn(),
  updateBike: vi.fn(),
  deleteBike: vi.fn(),
  createBikeComponent: vi.fn(),
  updateBikeComponent: vi.fn(),
  retireBikeComponent: vi.fn(),
  replaceBikeComponent: vi.fn(),
  deleteBikeComponent: vi.fn(),
  assignBikeToExerciseEntry: vi.fn(),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
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
app.use('/api/v2/bikes', bikeRoutes);
app.use(errorHandler);

const BIKE_ID = uuidv4();
const COMPONENT_ID = uuidv4();
const ENTRY_ID = uuidv4();

describe('Bike Routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists bikes and passes the status filter', async () => {
    vi.mocked(bikeRepo.getBikes).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/bikes?status=active');
    expect(res.statusCode).toBe(200);
    expect(bikeRepo.getBikes).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      'active'
    );
  });

  it('rejects an unknown status filter', async () => {
    const res = await request(app).get('/api/v2/bikes?status=lost');
    expect(res.statusCode).toBe(400);
    expect(bikeRepo.getBikes).not.toHaveBeenCalled();
  });

  it('creates a bike and rejects one without a name', async () => {
    vi.mocked(bikeRepo.createBike).mockResolvedValue({
      id: BIKE_ID,
    } as Awaited<ReturnType<typeof bikeRepo.createBike>>);
    const ok = await request(app)
      .post('/api/v2/bikes')
      .send({ name: 'Road bike', is_default: true });
    expect(ok.statusCode).toBe(201);
    expect(bikeRepo.createBike).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ name: 'Road bike', is_default: true }),
      'test-user-id'
    );
    const bad = await request(app).post('/api/v2/bikes').send({ brand: 'X' });
    expect(bad.statusCode).toBe(400);
  });

  it('404s for a missing bike and for a delete of a missing bike', async () => {
    vi.mocked(bikeRepo.getBikeById).mockResolvedValue(null);
    expect(
      (await request(app).get(`/api/v2/bikes/${BIKE_ID}`)).statusCode
    ).toBe(404);
    vi.mocked(bikeRepo.deleteBike).mockResolvedValue(false);
    expect(
      (await request(app).delete(`/api/v2/bikes/${BIKE_ID}`)).statusCode
    ).toBe(404);
  });

  it('updates a bike (retire)', async () => {
    vi.mocked(bikeRepo.updateBike).mockResolvedValue({
      id: BIKE_ID,
    } as Awaited<ReturnType<typeof bikeRepo.updateBike>>);
    const res = await request(app)
      .put(`/api/v2/bikes/${BIKE_ID}`)
      .send({ status: 'retired' });
    expect(res.statusCode).toBe(200);
    expect(bikeRepo.updateBike).toHaveBeenCalledWith(
      'test-user-id',
      BIKE_ID,
      { status: 'retired' },
      'test-user-id'
    );
  });

  describe('components', () => {
    it('installs a component and validates the body', async () => {
      vi.mocked(bikeRepo.createBikeComponent).mockResolvedValue({
        id: COMPONENT_ID,
      } as Awaited<ReturnType<typeof bikeRepo.createBikeComponent>>);
      const ok = await request(app)
        .post(`/api/v2/bikes/${BIKE_ID}/components`)
        .send({
          component_type: 'chain',
          name: 'Chain',
          installed_on: '2026-03-01',
        });
      expect(ok.statusCode).toBe(201);
      for (const body of [
        { component_type: 'wheel', name: 'x', installed_on: '2026-03-01' },
        { component_type: 'chain', name: 'x', installed_on: 'March' },
        {
          component_type: 'chain',
          name: 'x',
          installed_on: '2026-03-01',
          expected_life_km: 0,
        },
      ]) {
        const bad = await request(app)
          .post(`/api/v2/bikes/${BIKE_ID}/components`)
          .send(body);
        expect(bad.statusCode).toBe(400);
      }
      expect(bikeRepo.createBikeComponent).toHaveBeenCalledOnce();
    });

    it('404s when installing on an unknown bike', async () => {
      vi.mocked(bikeRepo.createBikeComponent).mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v2/bikes/${BIKE_ID}/components`)
        .send({
          component_type: 'tires',
          name: 'Tires',
          installed_on: '2026-03-01',
        });
      expect(res.statusCode).toBe(404);
    });

    it('retires with the given date and maps repository outcomes', async () => {
      vi.mocked(bikeRepo.retireBikeComponent).mockResolvedValueOnce({
        kind: 'retired',
        component: { id: COMPONENT_ID },
      } as Awaited<ReturnType<typeof bikeRepo.retireBikeComponent>>);
      const ok = await request(app)
        .post(`/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}/retire`)
        .send({ retired_on: '2026-05-01' });
      expect(ok.statusCode).toBe(200);
      expect(bikeRepo.retireBikeComponent).toHaveBeenCalledWith(
        'test-user-id',
        BIKE_ID,
        COMPONENT_ID,
        '2026-05-01',
        'test-user-id'
      );
      for (const [kind, status] of [
        ['not_found', 404],
        ['already_retired', 409],
        ['before_install', 400],
      ] as const) {
        vi.mocked(bikeRepo.retireBikeComponent).mockResolvedValueOnce({ kind });
        const res = await request(app)
          .post(`/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}/retire`)
          .send({});
        expect(res.statusCode).toBe(status);
      }
    });

    it('defaults the replacement day to today in the user timezone', async () => {
      vi.mocked(bikeRepo.replaceBikeComponent).mockResolvedValue({
        kind: 'replaced',
        result: {
          retired: { id: COMPONENT_ID },
          installed: { id: uuidv4() },
        },
      } as Awaited<ReturnType<typeof bikeRepo.replaceBikeComponent>>);
      const res = await request(app)
        .post(`/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}/replace`)
        .send({ name: 'New chain' });
      expect(res.statusCode).toBe(201);
      const replacedOn = vi.mocked(bikeRepo.replaceBikeComponent).mock
        .calls[0][3];
      expect(replacedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects replacing an already retired component', async () => {
      vi.mocked(bikeRepo.replaceBikeComponent).mockResolvedValue({
        kind: 'already_retired',
      });
      const res = await request(app)
        .post(`/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}/replace`)
        .send({ replaced_on: '2026-06-01' });
      expect(res.statusCode).toBe(409);
    });

    it('updates and deletes a component', async () => {
      vi.mocked(bikeRepo.updateBikeComponent).mockResolvedValue({
        id: COMPONENT_ID,
      } as Awaited<ReturnType<typeof bikeRepo.updateBikeComponent>>);
      const upd = await request(app)
        .put(`/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}`)
        .send({ expected_life_km: 3500 });
      expect(upd.statusCode).toBe(200);
      vi.mocked(bikeRepo.deleteBikeComponent).mockResolvedValue(false);
      const del = await request(app).delete(
        `/api/v2/bikes/${BIKE_ID}/components/${COMPONENT_ID}`
      );
      expect(del.statusCode).toBe(404);
    });
  });

  describe('PUT /assignments/:exerciseEntryId', () => {
    it('links and clears a bike', async () => {
      vi.mocked(bikeRepo.assignBikeToExerciseEntry).mockResolvedValue({
        exercise_entry_id: ENTRY_ID,
        bike_id: BIKE_ID,
      });
      const res = await request(app)
        .put(`/api/v2/bikes/assignments/${ENTRY_ID}`)
        .send({ bike_id: BIKE_ID });
      expect(res.statusCode).toBe(200);
      expect(bikeRepo.assignBikeToExerciseEntry).toHaveBeenCalledWith(
        'test-user-id',
        ENTRY_ID,
        BIKE_ID,
        'test-user-id'
      );
      vi.mocked(bikeRepo.assignBikeToExerciseEntry).mockResolvedValue({
        exercise_entry_id: ENTRY_ID,
        bike_id: null,
      });
      const cleared = await request(app)
        .put(`/api/v2/bikes/assignments/${ENTRY_ID}`)
        .send({ bike_id: null });
      expect(cleared.body.bike_id).toBeNull();
    });

    it('400s on a non-uuid bike id and 404s on an unknown entry', async () => {
      const bad = await request(app)
        .put(`/api/v2/bikes/assignments/${ENTRY_ID}`)
        .send({ bike_id: 'nope' });
      expect(bad.statusCode).toBe(400);
      vi.mocked(bikeRepo.assignBikeToExerciseEntry).mockResolvedValue(null);
      const missing = await request(app)
        .put(`/api/v2/bikes/assignments/${ENTRY_ID}`)
        .send({ bike_id: BIKE_ID });
      expect(missing.statusCode).toBe(404);
    });
  });
});
