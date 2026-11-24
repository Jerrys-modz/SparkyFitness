import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { recordSyncedBloodPressure } from '../services/bloodPressureSyncService.js';

vi.mock('../models/genericHealthRepository.js', () => ({
  bulkUpsertVitals: vi.fn(),
}));

const upsert = vi.mocked(genericHealthRepository.bulkUpsertVitals);
const AT = '2026-11-20T13:05:00.000Z';

const rows = () => upsert.mock.calls.flatMap((call) => call[2]);

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockImplementation(
    async (_u: string, _a: string, entries: unknown[]) =>
      entries.map(() => ({})) as never
  );
});

describe('recordSyncedBloodPressure', () => {
  it('merges the two halves of one instant and source into one row', async () => {
    const written = await recordSyncedBloodPressure('u1', 'u1', [
      {
        entryDate: '2026-11-20',
        timestamp: AT,
        sourceProvider: 'healthkit',
        systolic: 120,
      },
      {
        entryDate: '2026-11-20',
        timestamp: AT,
        sourceProvider: 'healthkit',
        diastolic: 80,
        pulse: 62,
      },
    ]);
    expect(written).toBe(1);
    expect(rows()).toEqual([
      expect.objectContaining({
        systolic_mmhg: 120,
        diastolic_mmhg: 80,
        pulse_bpm: 62,
        source_provider: 'healthkit',
      }),
    ]);
  });

  it('keeps a lone half so the other half can complete it later', async () => {
    await recordSyncedBloodPressure('u1', 'u1', [
      {
        entryDate: '2026-11-20',
        timestamp: AT,
        sourceProvider: 'health_connect',
        systolic: 120,
      },
    ]);
    expect(rows()).toEqual([
      expect.objectContaining({ systolic_mmhg: 120, diastolic_mmhg: null }),
    ]);
  });

  it('drops values a cuff cannot read and pairs where systolic is not above diastolic', async () => {
    const written = await recordSyncedBloodPressure('u1', 'u1', [
      {
        entryDate: '2026-11-20',
        timestamp: AT,
        sourceProvider: 'healthkit',
        systolic: 900,
        diastolic: 900,
      },
      {
        entryDate: '2026-11-20',
        timestamp: '2026-11-20T14:00:00.000Z',
        sourceProvider: 'healthkit',
        systolic: 80,
        diastolic: 90,
      },
    ]);
    expect(written).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never throws when the write fails', async () => {
    upsert.mockRejectedValue(new Error('db down'));
    await expect(
      recordSyncedBloodPressure('u1', 'u1', [
        {
          entryDate: '2026-11-20',
          timestamp: AT,
          sourceProvider: 'withings',
          systolic: 120,
          diastolic: 80,
        },
      ])
    ).resolves.toBe(0);
  });
});
