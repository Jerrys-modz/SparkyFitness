import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import dietPhaseRoutes from '../routes/v2/dietPhaseRoutes.js';
import {
  DietPhaseValidationError,
  getDietPhaseOverview,
  saveDietPhases,
} from '../services/dietPhaseService.js';

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));
vi.mock('../services/dietPhaseService.js', () => {
  class DietPhaseValidationError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    DietPhaseValidationError,
    getDietPhaseOverview: vi.fn(),
    saveDietPhases: vi.fn(),
  };
});

let actingAs = 'owner';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'owner';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/diet-phases', dietPhaseRoutes);
app.use(errorHandler);

const overview = {
  today: '2026-01-20',
  phases: [],
  status: {
    current: null,
    days_left: null,
    next: null,
    change_on: null,
    days_until_change: null,
    change_soon: false,
  },
};
const valid = {
  phases: [
    {
      phase_type: 'loss',
      weekly_change_kg: 0.5,
      start_date: '2026-02-01',
      duration_weeks: 4,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'owner';
});

describe('diet phase routes', () => {
  it('returns the plan', async () => {
    vi.mocked(getDietPhaseOverview).mockResolvedValue(overview);
    const res = await request(app).get('/api/v2/diet-phases');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(overview);
    expect(getDietPhaseOverview).toHaveBeenCalledWith('owner', 'owner');
  });

  it('lets a delegate read the plan', async () => {
    actingAs = 'delegate';
    vi.mocked(getDietPhaseOverview).mockResolvedValue(overview);
    const res = await request(app).get('/api/v2/diet-phases');
    expect(res.status).toBe(200);
  });

  it('saves a valid plan with defaults filled in', async () => {
    vi.mocked(saveDietPhases).mockResolvedValue(overview);
    const res = await request(app).put('/api/v2/diet-phases').send(valid);
    expect(res.status).toBe(200);
    expect(saveDietPhases).toHaveBeenCalledWith(
      'owner',
      {
        phases: [
          {
            ...valid.phases[0],
            end_date: null,
            target_weight_kg: null,
            label: null,
          },
        ],
      },
      'owner'
    );
  });

  it('refuses a malformed plan', async () => {
    const res = await request(app)
      .put('/api/v2/diet-phases')
      .send({ phases: [{ ...valid.phases[0], end_date: '2026-03-01' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(saveDietPhases).not.toHaveBeenCalled();
  });

  it('answers a refused plan with its code', async () => {
    vi.mocked(saveDietPhases).mockRejectedValue(
      new DietPhaseValidationError('past_locked', 'no')
    );
    const res = await request(app).put('/api/v2/diet-phases').send(valid);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'no', code: 'past_locked' });
  });

  it('refuses a delegate changing the plan', async () => {
    actingAs = 'delegate';
    const res = await request(app).put('/api/v2/diet-phases').send(valid);
    expect(res.status).toBe(403);
    expect(saveDietPhases).not.toHaveBeenCalled();
  });
});
