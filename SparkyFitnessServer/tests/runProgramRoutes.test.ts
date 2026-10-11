import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import runProgramRoutes from '../routes/v2/runProgramRoutes.js';
import {
  completeRunProgramWorkout,
  getRunProgram,
  UnknownRunProgramError,
  upsertRunProgram,
} from '../models/runProgramRepository.js';

vi.mock('../models/runProgramRepository.js', () => {
  class UnknownRunProgramError extends Error {}
  return {
    getRunProgram: vi.fn(),
    upsertRunProgram: vi.fn(),
    completeRunProgramWorkout: vi.fn(),
    UnknownRunProgramError,
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
app.use('/api/v2/run-program', runProgramRoutes);
app.use(errorHandler);

const program = {
  id: 'p1',
  program_id: 'beginner5k',
  enabled: true,
  next_index: 0,
  workouts: [],
  adjustment_log: [],
  run_days: [],
  start_date: null,
  last_done_date: null,
  updated_at: '2026-10-10T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('run program routes', () => {
  it('returns null before a program is chosen', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    const res = await request(app).get('/api/v2/run-program');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ program: null });
  });

  it('starts a program', async () => {
    vi.mocked(upsertRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k' });
    expect(res.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'test-user-id',
      { program_id: 'beginner5k' },
      'test-user-id'
    );
  });

  it('rejects a bad body and an unknown program', async () => {
    const bad = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k', next_index: -1 });
    expect(bad.status).toBe(400);

    vi.mocked(upsertRunProgram).mockRejectedValue(
      new UnknownRunProgramError('nope')
    );
    const unknown = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'nope' });
    expect(unknown.status).toBe(400);
  });

  it('completes the due workout and returns the program', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 0 });
    expect(res.status).toBe(200);
    expect(completeRunProgramWorkout).toHaveBeenCalledWith(
      'test-user-id',
      0,
      'test-user-id',
      undefined,
      undefined
    );
    expect(res.body.program.id).toBe('p1');
  });

  it('only completes a workout of the program it was done under', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 2, program_id: 'beginner5k' });
    expect(completeRunProgramWorkout).toHaveBeenLastCalledWith(
      'test-user-id',
      2,
      'test-user-id',
      'beginner5k',
      undefined
    );
  });

  it('records the day a workout was done', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 1, day: '2026-10-12' });
    expect(completeRunProgramWorkout).toHaveBeenLastCalledWith(
      'test-user-id',
      1,
      'test-user-id',
      undefined,
      '2026-10-12'
    );
  });

  it('saves the Diary days and the first day, and rejects bad ones', async () => {
    vi.mocked(upsertRunProgram).mockResolvedValue(program);
    const ok = await request(app)
      .put('/api/v2/run-program')
      .send({
        program_id: 'beginner5k',
        run_days: [1, 3, 5],
        start_date: '2026-10-13',
      });
    expect(ok.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({
        run_days: [1, 3, 5],
        start_date: '2026-10-13',
      }),
      'test-user-id'
    );
    const cleared = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k', start_date: null });
    expect(cleared.status).toBe(200);
    for (const bad of [{ run_days: [7] }, { start_date: 'tomorrow' }]) {
      const res = await request(app)
        .put('/api/v2/run-program')
        .send({ program_id: 'beginner5k', ...bad });
      expect(res.status).toBe(400);
    }
  });

  it('validates the completed index', async () => {
    const res = await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 'x' });
    expect(res.status).toBe(400);
  });

  it('is owner-only: a delegated context is refused', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/run-program');
    expect(res.status).toBe(403);
    expect(getRunProgram).not.toHaveBeenCalled();
  });
});
