import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import immunizationRoutes from '../routes/v2/immunizationRoutes.js';
import * as repo from '../models/immunizationRepository.js';
import { extractImmunizations } from '../services/immunizationScanService.js';

vi.mock('../models/immunizationRepository.js', () => ({
  listImmunizations: vi.fn(),
  getImmunizationById: vi.fn(),
  createImmunization: vi.fn(),
  updateImmunization: vi.fn(),
  deleteImmunization: vi.fn(),
  importImmunizations: vi.fn(),
}));

vi.mock('../services/immunizationScanService.js', () => ({
  extractImmunizations: vi.fn(),
  flagAlreadyRecorded: vi.fn((extraction: { records: unknown[] }) =>
    extraction.records.map((r) => ({
      ...(r as object),
      already_recorded: false,
    }))
  ),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/immunizations', immunizationRoutes);
app.use(errorHandler);

const ID = uuidv4();
const record = {
  id: ID,
  user_id: 'test-user-id',
  vaccine_name: 'Influenza',
  vaccine_code: null,
  administered_on: '2026-10-01',
  dose_number: null,
  lot_number: null,
  administered_by: null,
  site: null,
  next_due_on: null,
  notes: null,
  source: 'manual' as const,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

describe('Immunization routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists records for the acting user', async () => {
    vi.mocked(repo.listImmunizations).mockResolvedValue([record]);
    const res = await request(app).get('/api/v2/immunizations');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repo.listImmunizations).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ limit: 1000 }),
      'test-user-id'
    );
  });

  it('rejects a bad date range query', async () => {
    const res = await request(app).get('/api/v2/immunizations?startDate=x');
    expect(res.statusCode).toBe(400);
    expect(repo.listImmunizations).not.toHaveBeenCalled();
  });

  it('creates a record', async () => {
    vi.mocked(repo.createImmunization).mockResolvedValue(record);
    const res = await request(app)
      .post('/api/v2/immunizations')
      .send({ vaccine_name: 'Influenza', administered_on: '2026-10-01' });
    expect(res.statusCode).toBe(201);
    expect(repo.createImmunization).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ vaccine_name: 'Influenza' }),
      'test-user-id'
    );
  });

  it('does not pass on a source a client sends', async () => {
    vi.mocked(repo.createImmunization).mockResolvedValue(record);
    await request(app).post('/api/v2/immunizations').send({
      vaccine_name: 'Influenza',
      administered_on: '2026-10-01',
      source: 'import',
    });
    expect(
      vi.mocked(repo.createImmunization).mock.calls[0]?.[1]
    ).not.toHaveProperty('source');
  });

  it('rejects a record without a date', async () => {
    const res = await request(app)
      .post('/api/v2/immunizations')
      .send({ vaccine_name: 'Influenza' });
    expect(res.statusCode).toBe(400);
    expect(repo.createImmunization).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed id without touching the database', async () => {
    const res = await request(app).get('/api/v2/immunizations/not-a-uuid');
    expect(res.statusCode).toBe(404);
    expect(repo.getImmunizationById).not.toHaveBeenCalled();
  });

  it('returns 404 when the record is not found', async () => {
    vi.mocked(repo.getImmunizationById).mockResolvedValue(null);
    const res = await request(app).get(`/api/v2/immunizations/${ID}`);
    expect(res.statusCode).toBe(404);
  });

  it('updates a record', async () => {
    vi.mocked(repo.updateImmunization).mockResolvedValue({
      ...record,
      lot_number: 'AB1',
    });
    const res = await request(app)
      .put(`/api/v2/immunizations/${ID}`)
      .send({ lot_number: 'AB1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.lot_number).toBe('AB1');
  });

  it('answers 400 when a partial update breaks the due-date check', async () => {
    vi.mocked(repo.updateImmunization).mockRejectedValue(
      Object.assign(new Error('check'), {
        code: '23514',
        constraint: 'immunizations_due_after_given_check',
      })
    );
    const res = await request(app)
      .put(`/api/v2/immunizations/${ID}`)
      .send({ next_due_on: '2020-01-01' });
    expect(res.statusCode).toBe(400);
  });

  it('deletes a record and 404s when it is gone', async () => {
    vi.mocked(repo.deleteImmunization).mockResolvedValueOnce(true);
    expect(
      (await request(app).delete(`/api/v2/immunizations/${ID}`)).statusCode
    ).toBe(200);
    vi.mocked(repo.deleteImmunization).mockResolvedValueOnce(false);
    expect(
      (await request(app).delete(`/api/v2/immunizations/${ID}`)).statusCode
    ).toBe(404);
  });

  describe('scan and import', () => {
    const extraction = {
      records: [
        {
          vaccine_name: 'Tdap',
          administered_on: '2026-05-04',
          dose_number: null,
          lot_number: null,
          administered_by: null,
          site: null,
        },
      ],
    };

    it('scans a document and returns the vaccines for review', async () => {
      vi.mocked(extractImmunizations).mockResolvedValue({
        success: true,
        extraction,
      });
      vi.mocked(repo.listImmunizations).mockResolvedValue([]);
      const res = await request(app)
        .post('/api/v2/immunizations/scan')
        .send({ document: 'abc', mime_type: 'application/pdf' });
      expect(res.statusCode).toBe(200);
      expect(res.body.records[0]).toMatchObject({
        vaccine_name: 'Tdap',
        already_recorded: false,
      });
      expect(repo.createImmunization).not.toHaveBeenCalled();
    });

    it("hands the scan the person's today so a booked appointment is dropped", async () => {
      vi.mocked(extractImmunizations).mockResolvedValue({
        success: true,
        extraction,
      });
      vi.mocked(repo.listImmunizations).mockResolvedValue([]);
      await request(app)
        .post('/api/v2/immunizations/scan')
        .send({ document: 'abc', mime_type: 'application/pdf' });
      const today = vi.mocked(extractImmunizations).mock.calls[0]?.[4];
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('maps a scan failure to its status', async () => {
      vi.mocked(extractImmunizations).mockResolvedValue({
        success: false,
        category: 'no_ai_configured',
        error: 'No AI service configured',
      });
      const res = await request(app)
        .post('/api/v2/immunizations/scan')
        .send({ document: 'abc', mime_type: 'application/pdf' });
      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('No AI service configured');
    });

    it('rejects a scan without a document', async () => {
      const res = await request(app)
        .post('/api/v2/immunizations/scan')
        .send({ mime_type: 'application/pdf' });
      expect(res.statusCode).toBe(400);
      expect(extractImmunizations).not.toHaveBeenCalled();
    });

    it('saves reviewed records as one import', async () => {
      vi.mocked(repo.importImmunizations).mockResolvedValue(1);
      const res = await request(app)
        .post('/api/v2/immunizations/imports')
        .send(extraction);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ created: 1 });
      expect(repo.importImmunizations).toHaveBeenCalledWith(
        'test-user-id',
        extraction.records,
        'test-user-id'
      );
    });

    it('rejects an empty import', async () => {
      const res = await request(app)
        .post('/api/v2/immunizations/imports')
        .send({ records: [] });
      expect(res.statusCode).toBe(400);
      expect(repo.importImmunizations).not.toHaveBeenCalled();
    });
  });
});
