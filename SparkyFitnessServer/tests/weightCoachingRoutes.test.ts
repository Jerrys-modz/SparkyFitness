import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import reportRoutes from '../routes/reportRoutes.js';
import goalRoutes from '../routes/goalRoutes.js';
import { canAccessUserData } from '../utils/permissionUtils.js';

const svc = vi.hoisted(() => ({
  getCoachingCheckIn: vi.fn(),
  acceptCoachingCheckIn: vi.fn(),
  updateCoachingSettings: vi.fn(),
}));

vi.mock('../services/weightCoachingService.js', () => {
  class CoachingConflictError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { CoachingConflictError, default: svc };
});
vi.mock('../services/reportService.js', () => ({ default: {} }));
vi.mock('../services/goalService.js', () => ({ default: {} }));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

let actingAs: { userId: string; originalUserId?: string } = {
  userId: 'owner-id',
};
vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = actingAs.userId;
    req.authenticatedUserId = actingAs.originalUserId ?? actingAs.userId;
    req.originalUserId = actingAs.originalUserId ?? actingAs.userId;
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);
app.use('/api/goals', goalRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

const CHECK_IN = { asOf: '2026-12-01', reason: 'behind' };

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = { userId: 'owner-id' };
});

describe('GET /api/reports/coaching-checkin', () => {
  it('returns the signed-in person’s check-in', async () => {
    svc.getCoachingCheckIn.mockResolvedValue(CHECK_IN);
    const res = await request(app).get('/api/reports/coaching-checkin');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(CHECK_IN);
    expect(svc.getCoachingCheckIn).toHaveBeenCalledWith('owner-id', 'owner-id');
    expect(canAccessUserData).not.toHaveBeenCalled();
  });

  it('lets a delegate with reports access read another person’s check-in', async () => {
    vi.mocked(canAccessUserData).mockResolvedValue(true);
    svc.getCoachingCheckIn.mockResolvedValue(CHECK_IN);
    actingAs = { userId: 'delegate-id' };
    const res = await request(app).get(
      '/api/reports/coaching-checkin?userId=owner-id'
    );
    expect(res.statusCode).toBe(200);
    expect(canAccessUserData).toHaveBeenCalledWith(
      'owner-id',
      'reports',
      'delegate-id'
    );
    expect(svc.getCoachingCheckIn).toHaveBeenCalledWith(
      'delegate-id',
      'owner-id'
    );
  });

  it('refuses a delegate without reports access', async () => {
    vi.mocked(canAccessUserData).mockResolvedValue(false);
    actingAs = { userId: 'delegate-id' };
    const res = await request(app).get(
      '/api/reports/coaching-checkin?userId=owner-id'
    );
    expect(res.statusCode).toBe(403);
    expect(svc.getCoachingCheckIn).not.toHaveBeenCalled();
  });
});

describe('PUT /api/goals/coaching-settings', () => {
  it('saves valid settings', async () => {
    const saved = { direction: 'lose', rateKgPerWeek: 0.5, checkInWeekday: 3 };
    svc.updateCoachingSettings.mockResolvedValue(saved);
    const res = await request(app)
      .put('/api/goals/coaching-settings')
      .send(saved);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(saved);
    expect(svc.updateCoachingSettings).toHaveBeenCalledWith('owner-id', saved);
  });

  it.each([
    [{}],
    [{ direction: 'bulk' }],
    [{ rateKgPerWeek: 1.5 }],
    [{ rateKgPerWeek: -0.1 }],
    [{ checkInWeekday: 7 }],
  ])('rejects %j', async (body) => {
    const res = await request(app)
      .put('/api/goals/coaching-settings')
      .send(body);
    expect(res.statusCode).toBe(400);
    expect(svc.updateCoachingSettings).not.toHaveBeenCalled();
  });

  it('is refused while acting for someone else', async () => {
    actingAs = { userId: 'owner-id', originalUserId: 'delegate-id' };
    const res = await request(app)
      .put('/api/goals/coaching-settings')
      .send({ direction: 'gain' });
    expect(res.statusCode).toBe(403);
    expect(svc.updateCoachingSettings).not.toHaveBeenCalled();
  });
});

describe('POST /api/goals/coaching-checkin/accept', () => {
  it('accepts the calories that were shown', async () => {
    const targets = { calories: 1800, protein: 140, carbs: 190, fat: 50 };
    svc.acceptCoachingCheckIn.mockResolvedValue(targets);
    const res = await request(app)
      .post('/api/goals/coaching-checkin/accept')
      .send({ calories: 1800 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(targets);
    expect(svc.acceptCoachingCheckIn).toHaveBeenCalledWith('owner-id', 1800);
  });

  it('rejects a body without calories', async () => {
    const res = await request(app)
      .post('/api/goals/coaching-checkin/accept')
      .send({});
    expect(res.statusCode).toBe(400);
    expect(svc.acceptCoachingCheckIn).not.toHaveBeenCalled();
  });

  it('answers 409 with a code when the check-in cannot be accepted', async () => {
    const { CoachingConflictError } =
      await import('../services/weightCoachingService.js');
    svc.acceptCoachingCheckIn.mockRejectedValue(
      new CoachingConflictError('check-in-changed', 'changed')
    );
    const res = await request(app)
      .post('/api/goals/coaching-checkin/accept')
      .send({ calories: 1800 });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'changed', code: 'check-in-changed' });
  });

  it('passes other failures on as server errors', async () => {
    svc.acceptCoachingCheckIn.mockRejectedValue(new Error('db down'));
    const res = await request(app)
      .post('/api/goals/coaching-checkin/accept')
      .send({ calories: 1800 });
    expect(res.statusCode).toBe(500);
  });
});
