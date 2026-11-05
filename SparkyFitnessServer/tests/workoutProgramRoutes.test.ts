import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
// @ts-expect-error TS(7016): no type declarations shipped for supertest
import request from 'supertest';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  type WorkoutProgramFile,
} from '@workspace/shared';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
  WorkoutProgramExercisesUnavailableError,
  WorkoutProgramNotFoundError,
} from '../services/workoutProgramService.js';
import workoutProgramRoutes from '../routes/v2/workoutProgramRoutes.js';

vi.mock('../services/workoutProgramService.js', () => {
  class WorkoutProgramNotFoundError extends Error {}
  class WorkoutProgramExercisesUnavailableError extends Error {
    missingExerciseIds: string[];
    constructor(ids: string[]) {
      super('Some exercises could not be added.');
      this.missingExerciseIds = ids;
    }
  }
  return {
    exportWorkoutPlan: vi.fn(),
    exportWorkoutPreset: vi.fn(),
    importWorkoutProgram: vi.fn(),
    WorkoutProgramNotFoundError,
    WorkoutProgramExercisesUnavailableError,
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
app.use('/v2/workout-programs', workoutProgramRoutes);
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message });
});

const program: WorkoutProgramFile = {
  format: WORKOUT_PROGRAM_FILE_FORMAT,
  version: WORKOUT_PROGRAM_FILE_VERSION,
  exercises: [{ key: 'e1', name: 'Push Up' }],
  presets: [
    {
      key: 'p1',
      name: 'Push',
      workoutFormat: 'standard',
      exercises: [{ exercise: 'e1', sets: [{ setNumber: 1, reps: 10 }] }],
    },
  ],
};

describe('workout program routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actorId = 'owner-1';
  });

  it('exports a preset as a downloadable file', async () => {
    vi.mocked(exportWorkoutPreset).mockResolvedValue({
      ...program,
      presets: [{ ...program.presets[0], name: 'Push Day!' }],
      plan: null,
    });

    const res = await request(app).get(
      '/v2/workout-programs/presets/11/export'
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="push-day.sparkyfitness.json"'
    );
    expect(res.body.format).toBe(WORKOUT_PROGRAM_FILE_FORMAT);
    expect(exportWorkoutPreset).toHaveBeenCalledWith('owner-1', '11');
  });

  it('answers 404 for a plan the person cannot see', async () => {
    vi.mocked(exportWorkoutPlan).mockRejectedValue(
      new WorkoutProgramNotFoundError('Workout plan template not found.')
    );
    const res = await request(app).get('/v2/workout-programs/plans/3/export');
    expect(res.status).toBe(404);
  });

  it('imports a valid file with custom exercises allowed', async () => {
    vi.mocked(importWorkoutProgram).mockResolvedValue({
      planId: null,
      presetIds: { p1: 5 },
      addedExerciseCount: 1,
    });

    const res = await request(app)
      .post('/v2/workout-programs/import')
      .send({ program });

    expect(res.status).toBe(201);
    expect(res.body.presetIds).toEqual({ p1: 5 });
    expect(importWorkoutProgram).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ format: WORKOUT_PROGRAM_FILE_FORMAT }),
      { planName: undefined, activate: false, allowCustomExercises: true }
    );
  });

  it('rejects a file that is not a program', async () => {
    const res = await request(app)
      .post('/v2/workout-programs/import')
      .send({ program: { hello: 'world' } });
    expect(res.status).toBe(400);
    expect(importWorkoutProgram).not.toHaveBeenCalled();
  });

  it('answers 502 with the exercises that could not be added', async () => {
    vi.mocked(importWorkoutProgram).mockRejectedValue(
      new WorkoutProgramExercisesUnavailableError(['Push_Up'])
    );
    const res = await request(app)
      .post('/v2/workout-programs/import')
      .send({ program });
    expect(res.status).toBe(502);
    expect(res.body.missingExerciseIds).toEqual(['Push_Up']);
  });

  it('refuses a delegated context', async () => {
    actorId = 'caregiver-2';
    const res = await request(app)
      .post('/v2/workout-programs/import')
      .send({ program });
    expect(res.status).toBe(403);
    expect(importWorkoutProgram).not.toHaveBeenCalled();
  });
});
