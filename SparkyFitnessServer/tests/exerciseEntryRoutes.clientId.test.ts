import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.originalUserId = 'actor-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (_req: any, _res: any, next: any) => next()
  ),
}));
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    single: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  })),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: { createOrReplayExerciseEntry: vi.fn() },
}));
vi.mock('../services/exerciseEntryService.js', () => ({ default: {} }));
vi.mock('../services/fitImportService.js', () => ({ default: {} }));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/exercise-entries', exerciseEntryRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status ?? 500).json({ error: err.message });
});

const ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const body = {
  exercise_id: '11111111-1111-1111-1111-111111111111',
  duration_minutes: 30,
  entry_date: '2026-07-18',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exerciseService.createOrReplayExerciseEntry).mockResolvedValue({
    entry: { id: ENTRY_ID },
    replayed: false,
  });
});

describe('POST /exercise-entries with a client-minted id', () => {
  it('passes the id on and answers 201 for a new entry', async () => {
    await request(app)
      .post('/exercise-entries')
      .send({ ...body, id: ENTRY_ID })
      .expect(201);
    const [, , data] = vi.mocked(exerciseService.createOrReplayExerciseEntry)
      .mock.calls[0];
    expect(data.id).toBe(ENTRY_ID);
  });

  it('answers 200 with the stored entry for a repeated create', async () => {
    vi.mocked(exerciseService.createOrReplayExerciseEntry).mockResolvedValue({
      entry: { id: ENTRY_ID },
      replayed: true,
    });
    const response = await request(app)
      .post('/exercise-entries')
      .send({ ...body, id: ENTRY_ID })
      .expect(200);
    expect(response.body.id).toBe(ENTRY_ID);
  });

  it('refuses an id that is not a uuid', async () => {
    await request(app)
      .post('/exercise-entries')
      .send({ ...body, id: 'not-a-uuid' })
      .expect(400);
    expect(exerciseService.createOrReplayExerciseEntry).not.toHaveBeenCalled();
  });

  it('sends no id when the request has none', async () => {
    await request(app).post('/exercise-entries').send(body).expect(201);
    const [, , data] = vi.mocked(exerciseService.createOrReplayExerciseEntry)
      .mock.calls[0];
    expect('id' in data).toBe(false);
  });
});
