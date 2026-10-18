import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countHeatRowsAfter,
  getHeatStamp,
  getTrackBatch,
  listHeatEntries,
} from '../models/heatmapRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('heatmap queries', () => {
  it('lists only ids, days and names for the owner in a date range', async () => {
    query.mockResolvedValue({
      rows: [
        {
          entry_id: 'e1',
          entry_date: '2026-10-01',
          exercise_name: 'Run',
          category: 'cardio',
          notes: null,
        },
      ],
    });
    const rows = await listHeatEntries('u1', '2026-01-01', null);
    expect(rows).toEqual([
      {
        entryId: 'e1',
        entryDate: '2026-10-01',
        exerciseName: 'Run',
        category: 'cardio',
        notes: null,
      },
    ]);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).not.toContain('p.points');
    expect(sql).toContain('p.user_id = $1');
    expect(params).toEqual(['u1', '2026-01-01', null, null]);
    expect(release).toHaveBeenCalled();
  });

  it('can ask only for tracks changed after a stamp', async () => {
    query.mockResolvedValue({ rows: [] });
    await listHeatEntries('u1', null, null, undefined, 'ts');
    expect(query.mock.calls[0]?.[1]?.[3]).toBe('ts');
    expect(query.mock.calls[0]?.[0]).toContain(
      'p.updated_at > $4::timestamptz'
    );
  });

  it('fingerprints the tracks by count and newest change', async () => {
    query.mockResolvedValue({
      rows: [{ n: 4, last: '2026-10-01 10:00:00+00' }],
    });
    expect(await getHeatStamp('u1', null, null)).toEqual({
      count: 4,
      last: '2026-10-01 10:00:00+00',
    });
    query.mockResolvedValue({ rows: [{ n: 0, last: null }] });
    expect(await getHeatStamp('u1', null, null)).toEqual({
      count: 0,
      last: null,
    });
    query.mockResolvedValue({ rows: [{ n: 2 }] });
    expect(await countHeatRowsAfter('u1', null, null, 'ts')).toBe(2);
  });

  it('reads a batch of tracks and drops malformed fixes', async () => {
    query.mockResolvedValue({
      rows: [
        {
          entry_id: 'e1',
          points: [
            { t: '2026-10-01T08:00:00Z', lat: 40, lon: -74, hacc: 5 },
            { lat: '40', lon: -74 },
            { lat: 40.001, lon: -74 },
            null,
          ],
        },
        { entry_id: 'e2', points: 'broken' },
      ],
    });
    const out = await getTrackBatch('u1', ['e1', 'e2']);
    expect(out.get('e1')).toEqual([
      { lat: 40, lon: -74, tMs: Date.parse('2026-10-01T08:00:00Z'), hacc: 5 },
      { lat: 40.001, lon: -74 },
    ]);
    expect(out.has('e2')).toBe(false);
    expect(query.mock.calls[0]?.[1]).toEqual(['u1', ['e1', 'e2']]);
    expect((await getTrackBatch('u1', [])).size).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
