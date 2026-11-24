import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { recordSyncedBloodPressure } from '../services/bloodPressureSyncService.js';

vi.mock('../models/genericHealthRepository.js', () => ({
  bulkUpsertVitals: vi.fn(),
  findNearbyBloodPressureTimestamp: vi.fn(),
}));

const upsert = vi.mocked(genericHealthRepository.bulkUpsertVitals);
const nearby = vi.mocked(
  genericHealthRepository.findNearbyBloodPressureTimestamp
);
const AT = '2026-11-20T13:05:00.000Z';

const rows = () => upsert.mock.calls.flatMap((call) => call[2]);

beforeEach(() => {
  vi.clearAllMocks();
  nearby.mockResolvedValue(null);
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

describe('one Withings reading reported twice', () => {
  const reading = (timestamp: string, sourceProvider: string) => ({
    entryDate: '2026-11-20',
    timestamp,
    sourceProvider,
    systolic: 120,
    diastolic: 80,
  });

  it('reuses the stored instant of a Withings reading a few seconds away', async () => {
    nearby.mockResolvedValue(new Date('2026-11-20T08:00:00.000Z'));
    await recordSyncedBloodPressure('u1', 'u1', [
      reading('2026-11-20T08:00:12.000Z', 'withings'),
    ]);
    expect(nearby).toHaveBeenCalledWith(
      'u1',
      'u1',
      'withings',
      new Date('2026-11-20T08:00:12.000Z'),
      30
    );
    expect(rows()[0]?.timestamp).toEqual(new Date('2026-11-20T08:00:00.000Z'));
  });

  it('keeps the instant when nothing is near, and never snaps other sources', async () => {
    await recordSyncedBloodPressure('u1', 'u1', [
      reading('2026-11-20T08:00:12.000Z', 'withings'),
      reading('2026-11-20T09:00:12.000Z', 'healthkit'),
    ]);
    expect(nearby).toHaveBeenCalledTimes(1);
    expect(rows().map((r) => r.timestamp)).toEqual([
      new Date('2026-11-20T08:00:12.000Z'),
      new Date('2026-11-20T09:00:12.000Z'),
    ]);
  });
});
