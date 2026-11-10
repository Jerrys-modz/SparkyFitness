import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import assistantRoutes from '../routes/v2/assistantRoutes.js';
import {
  DailySummaryProviderError,
  getDailySummary,
} from '../services/assistantDailySummaryService.js';

vi.mock('../services/assistantDailySummaryService.js', () => {
  class DailySummaryProviderError extends Error {}
  return { DailySummaryProviderError, getDailySummary: vi.fn() };
});
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn().mockResolvedValue(false),
}));

let actingFor = 'owner';
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.authenticatedUserId = 'owner';
  req.userId = actingFor;
  next();
});
app.use('/api/v2/assistant', assistantRoutes);
app.use(errorHandler);

const ready = {
  status: 'ready' as const,
  date: '2026-11-10',
  summary: 'A good start.',
  suggestions: [],
  generated_at: '2026-11-10T08:00:00.000Z',
};

describe('POST /api/v2/assistant/daily-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingFor = 'owner';
    vi.mocked(getDailySummary).mockResolvedValue(ready);
  });

  it('returns the summary for the signed-in person', async () => {
    const res = await request(app).post('/api/v2/assistant/daily-summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ready);
    expect(getDailySummary).toHaveBeenCalledWith('owner', {
      refresh: undefined,
      actorIsAdmin: false,
    });
  });

  it('passes refresh through', async () => {
    await request(app)
      .post('/api/v2/assistant/daily-summary')
      .send({ refresh: true });
    expect(vi.mocked(getDailySummary).mock.calls[0][1]).toMatchObject({
      refresh: true,
    });
  });

  it('rejects unknown fields', async () => {
    const res = await request(app)
      .post('/api/v2/assistant/daily-summary')
      .send({ date: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  it('refuses a delegated context', async () => {
    actingFor = 'someone-else';
    const res = await request(app).post('/api/v2/assistant/daily-summary');
    expect(res.status).toBe(403);
    expect(getDailySummary).not.toHaveBeenCalled();
  });

  it('answers 502 when the AI service fails', async () => {
    vi.mocked(getDailySummary).mockRejectedValue(
      new DailySummaryProviderError('failed')
    );
    const res = await request(app).post('/api/v2/assistant/daily-summary');
    expect(res.status).toBe(502);
  });
});
