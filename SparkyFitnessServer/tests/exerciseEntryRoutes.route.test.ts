import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import exerciseEntryService from '../services/exerciseEntryService.js';

let actor = 'user-123';
vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.originalUserId = actor;
    req.authenticatedUserId = actor;
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
  createUploadMiddleware: vi.fn(() =>
    multer({ storage: multer.memoryStorage() })
  ),
}));
vi.mock('../services/exerciseService.js', () => ({ default: {} }));
vi.mock('../services/exerciseEntryService.js', () => ({
  default: { attachRouteToExerciseEntry: vi.fn() },
}));
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

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';
const ROUTE_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  actor = 'user-123';
  vi.mocked(exerciseEntryService.attachRouteToExerciseEntry).mockResolvedValue(
    undefined
  );
});

describe('POST /exercise-entries/:id/route', () => {
  it('links the entry to the route as the acting user', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({ routeId: ROUTE_ID })
      .expect(204);
    expect(
      exerciseEntryService.attachRouteToExerciseEntry
    ).toHaveBeenCalledWith('user-123', 'user-123', ENTRY_ID, ROUTE_ID);
  });

  it('clears the link with a null route', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({ routeId: null })
      .expect(204);
    expect(
      exerciseEntryService.attachRouteToExerciseEntry
    ).toHaveBeenCalledWith('user-123', 'user-123', ENTRY_ID, null);
  });

  it('rejects a bad entry id and a bad body', async () => {
    await request(app)
      .post('/exercise-entries/nope/route')
      .send({ routeId: ROUTE_ID })
      .expect(400);
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({ routeId: 'not-a-uuid' })
      .expect(400);
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({})
      .expect(400);
    expect(
      exerciseEntryService.attachRouteToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('refuses a delegated context', async () => {
    actor = 'someone-else';
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({ routeId: ROUTE_ID })
      .expect(403);
    expect(
      exerciseEntryService.attachRouteToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('answers 404 when the entry or route is not found', async () => {
    const notFound = Object.assign(new Error('Route not found.'), {
      status: 404,
    });
    vi.mocked(
      exerciseEntryService.attachRouteToExerciseEntry
    ).mockRejectedValueOnce(notFound);
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/route`)
      .send({ routeId: ROUTE_ID })
      .expect(404);
    expect(res.body).toEqual({ error: 'Route not found.' });
  });
});
