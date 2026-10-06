import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import habitRepository from '../models/habitRepository.js';
import habitRoutes from '../routes/habitRoutes.js';

vi.mock('../models/habitRepository.js', () => ({
  default: {
    listHabits: vi.fn(),
    listHabitLogsInRange: vi.fn(),
    createHabit: vi.fn(),
    habitExists: vi.fn(),
    upsertHabitLog: vi.fn(),
    deleteHabit: vi.fn(),
  },
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = 'test-user-id';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/api/habits', habitRoutes);

const HABIT_ID = uuidv4();
const repo = vi.mocked(habitRepository);

describe('Habit routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists habits', async () => {
    repo.listHabits.mockResolvedValue([
      { id: HABIT_ID, name: 'Meditate', display_name: 'Meditate' },
    ]);
    const res = await request(app).get('/api/habits');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repo.listHabits).toHaveBeenCalledWith('test-user-id');
  });

  it('lists logs for a date range and rejects bad dates', async () => {
    repo.listHabitLogsInRange.mockResolvedValue([]);
    const ok = await request(app).get(
      '/api/habits/logs?startDate=2026-10-01&endDate=2026-10-07'
    );
    expect(ok.status).toBe(200);
    expect(repo.listHabitLogsInRange).toHaveBeenCalledWith(
      'test-user-id',
      '2026-10-01',
      '2026-10-07'
    );
    const bad = await request(app).get('/api/habits/logs?startDate=nope');
    expect(bad.status).toBe(400);
  });

  it('creates a habit and rejects an empty name', async () => {
    repo.createHabit.mockResolvedValue({
      id: HABIT_ID,
      name: 'Stretch',
      display_name: 'Stretch',
    });
    const res = await request(app)
      .post('/api/habits')
      .send({ name: ' Stretch ' });
    expect(res.status).toBe(201);
    expect(repo.createHabit).toHaveBeenCalledWith('test-user-id', 'Stretch');
    const bad = await request(app).post('/api/habits').send({ name: '  ' });
    expect(bad.status).toBe(400);
  });

  it('logs a completion', async () => {
    repo.habitExists.mockResolvedValue(true);
    const res = await request(app)
      .put(`/api/habits/${HABIT_ID}/log`)
      .send({ entry_date: '2026-10-06', completed: true });
    expect(res.status).toBe(204);
    expect(repo.upsertHabitLog).toHaveBeenCalledWith(
      'test-user-id',
      HABIT_ID,
      '2026-10-06',
      'true'
    );
  });

  it('returns 404 when logging an unknown habit', async () => {
    repo.habitExists.mockResolvedValue(false);
    const res = await request(app)
      .put(`/api/habits/${HABIT_ID}/log`)
      .send({ entry_date: '2026-10-06', completed: false });
    expect(res.status).toBe(404);
    expect(repo.upsertHabitLog).not.toHaveBeenCalled();
  });

  it('deletes a habit, 404 when missing', async () => {
    repo.deleteHabit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await request(app).delete(`/api/habits/${HABIT_ID}`)).status).toBe(
      204
    );
    expect((await request(app).delete(`/api/habits/${HABIT_ID}`)).status).toBe(
      404
    );
  });
});
