import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
// @ts-expect-error TS(7016): no type declarations shipped for supertest
import request from 'supertest';
import {
  importWorkoutSplit,
  UnknownWorkoutSplitError,
  WorkoutSplitExercisesUnavailableError,
} from '../services/workoutSplitService.js';
import { ValidationError } from '../utils/errors.js';
import workoutSplitRoutes from '../routes/v2/workoutSplitRoutes.js';

vi.mock('../services/workoutSplitService.js', () => {
  class UnknownWorkoutSplitError extends Error {}
  class WorkoutSplitExercisesUnavailableError extends Error {
    missingExerciseIds: string[];
    constructor(ids: string[]) {
      super('Some exercises could not be added.');
      this.missingExerciseIds = ids;
    }
  }
  return {
    importWorkoutSplit: vi.fn(),
    UnknownWorkoutSplitError,
    WorkoutSplitExercisesUnavailableError,
  };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

let actorId = 'owner-1';
const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.userId = 'owner-1';
  req.authenticatedUserId = actorId;
  next();
});
app.use('/v2/workout-splits', workoutSplitRoutes);
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message });
});

const body = {
  planName: 'Starter',
  sessionNames: { workout_a: 'A', workout_b: 'B' },
};
const post = (id = 'linear_5x5', payload: unknown = body) =>
  request(app).post(`/v2/workout-splits/${id}/import`).send(payload);

describe('POST /v2/workout-splits/:splitId/import', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actorId = 'owner-1';
  });

  it('imports with the person from the request and defaults activate to off', async () => {
    vi.mocked(importWorkoutSplit).mockResolvedValue({
      planId: 7,
      presetIds: { workout_a: 1, workout_b: 2 },
      addedExerciseCount: 4,
    });

    const res = await post();

    expect(res.status).toBe(201);
    expect(res.body.planId).toBe(7);
    expect(importWorkoutSplit).toHaveBeenCalledWith('owner-1', 'linear_5x5', {
      ...body,
      activate: false,
    });
  });

  it('rejects a body without a plan name', async () => {
    const res = await post('linear_5x5', { sessionNames: body.sessionNames });
    expect(res.status).toBe(400);
    expect(importWorkoutSplit).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown split', async () => {
    vi.mocked(importWorkoutSplit).mockRejectedValue(
      new UnknownWorkoutSplitError('x')
    );
    expect((await post('nope')).status).toBe(404);
  });

  it('answers 400 when a session has no name', async () => {
    vi.mocked(importWorkoutSplit).mockRejectedValue(
      new ValidationError('Missing a name for session workout_b.')
    );
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workout_b');
  });

  it('answers 502 with the exercises that could not be added', async () => {
    vi.mocked(importWorkoutSplit).mockRejectedValue(
      new WorkoutSplitExercisesUnavailableError(['Barbell_Squat'])
    );
    const res = await post();
    expect(res.status).toBe(502);
    expect(res.body.missingExerciseIds).toEqual(['Barbell_Squat']);
  });

  it('refuses a switched context', async () => {
    actorId = 'someone-else';
    const res = await post();
    expect(res.status).toBe(403);
    expect(importWorkoutSplit).not.toHaveBeenCalled();
  });
  it('passes the program finder\u2019s answers through', async () => {
    vi.mocked(importWorkoutSplit).mockResolvedValue({
      planId: 7,
      presetIds: {},
      addedExerciseCount: 0,
    });
    const trainer = { venue: 'home', sessionMinutes: 40, focus: 'core' };

    const res = await post('push_pull_legs_3_home', { ...body, trainer });

    expect(res.status).toBe(201);
    expect(importWorkoutSplit).toHaveBeenCalledWith(
      'owner-1',
      'push_pull_legs_3_home',
      expect.objectContaining({ trainer })
    );
  });

  it.each([
    [
      'a session length it does not offer',
      { venue: 'home', sessionMinutes: 45 },
    ],
    ['an unknown focus', { venue: 'home', focus: 'neck' }],
    ['no venue', { sessionMinutes: 40 }],
  ])('rejects %s', async (_name, trainer) => {
    const res = await post('push_pull_legs_3_home', { ...body, trainer });
    expect(res.status).toBe(400);
    expect(importWorkoutSplit).not.toHaveBeenCalled();
  });
});
