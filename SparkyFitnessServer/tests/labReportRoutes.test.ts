import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import labReportRoutes from '../routes/v2/labReportRoutes.js';
import { extractLabReport } from '../services/labReportScanService.js';

vi.mock('../services/labReportScanService.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/labReportScanService.js')
  >()),
  extractLabReport: vi.fn(),
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn(async () => false),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'testUser';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));
vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/lab-reports', labReportRoutes);

const body = { document: 'abc', mime_type: 'application/pdf' };

describe('POST /api/v2/lab-reports/scan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the results with their matched marker keys', async () => {
    vi.mocked(extractLabReport).mockResolvedValue({
      success: true,
      report: {
        lab_name: 'Quest',
        collected_on: '2026-09-20',
        results: [
          {
            name: 'Hemoglobin A1c',
            value: 5.4,
            unit: '%',
            ref_low: 4,
            ref_high: 5.6,
          },
          {
            name: 'Odd Test',
            value: 2,
            unit: null,
            ref_low: null,
            ref_high: null,
          },
        ],
      },
    });

    const res = await request(app).post('/api/v2/lab-reports/scan').send(body);

    expect(res.statusCode).toBe(200);
    expect(res.body.report.collected_on).toBe('2026-09-20');
    expect(
      res.body.report.results.map(
        (r: { marker_key: string | null }) => r.marker_key
      )
    ).toEqual(['hba1c', null]);
    expect(extractLabReport).toHaveBeenCalledWith(
      'abc',
      'application/pdf',
      'testUser',
      false
    );
  });

  it.each([
    ['no_ai_configured', 422],
    ['unreadable_pdf', 422],
    ['document_too_large', 400],
    ['private_network_forbidden', 403],
    ['upstream_error', 502],
    ['timeout', 504],
  ] as const)('maps the %s failure to HTTP %i', async (category, status) => {
    vi.mocked(extractLabReport).mockResolvedValue({
      success: false,
      category,
      error: 'nope',
    });

    const res = await request(app).post('/api/v2/lab-reports/scan').send(body);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: 'nope' });
  });

  it('rejects a request with no document', async () => {
    const res = await request(app).post('/api/v2/lab-reports/scan').send({});

    expect(res.statusCode).toBe(400);
    expect(extractLabReport).not.toHaveBeenCalled();
  });
});
