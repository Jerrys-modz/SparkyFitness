import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEntryEfforts,
  createSegment,
  deleteSegment,
  getEntryTrackFixes,
  listEntryEfforts,
  listSegments,
  listUnmatchedCandidates,
  renameSegment,
  saveEfforts,
  SegmentLimitError,
} from '../models/segmentRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();

const row = {
  id: 'seg-1',
  name: 'Hill',
  activity: 'run',
  length_m: 1000,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  source_route_id: null,
  source_exercise_entry_id: null,
  effort_count: 3,
  best_seconds: 240.5,
  last_effort_date: '2026-10-16',
  created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-02T00:00:00Z'),
};

const newSegment = {
  name: null,
  activity: 'run' as const,
  lengthM: 1000,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  bounds: { minLat: 40, minLon: -74, maxLat: 40.01, maxLon: -74 },
  sourceRouteId: null,
  sourceExerciseEntryId: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('segment queries', () => {
  it("lists only the person's segments with their own history", async () => {
    query.mockResolvedValue({ rows: [row] });
    const [summary] = await listSegments('u1');
    expect(summary).toMatchObject({
      id: 'seg-1',
      lengthM: 1000,
      effortCount: 3,
      bestSeconds: 240.5,
      lastEffortDate: '2026-10-16',
      start: { lat: 40, lon: -74 },
    });
    expect(summary).not.toHaveProperty('points');
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('elapsed_seconds IS NOT NULL');
    expect(params).toEqual(['u1']);
    expect(release).toHaveBeenCalled();
  });

  it('enforces the per-person limit under a lock and rolls back', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ n: 500 }] };
      return { rows: [] };
    });
    await expect(createSegment('u1', newSegment)).rejects.toBeInstanceOf(
      SegmentLimitError
    );
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some((s) => s.includes('INSERT INTO segments'))).toBe(false);
    expect(release).toHaveBeenCalled();
  });

  it('inserts with the sources checked against the owner', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ n: 2 }] };
      if (sql.includes('INSERT INTO segments')) return { rows: [row] };
      return { rows: [] };
    });
    const created = await createSegment('u1', {
      ...newSegment,
      sourceRouteId: 'r1',
    });
    expect(created.id).toBe('seg-1');
    const insert = query.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO segments')
    );
    expect(insert?.[0]).toContain('user_id = $1');
    expect(insert?.[1]?.[9]).toBe('r1');
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('renames and deletes scoped to the owner', async () => {
    query.mockResolvedValueOnce({ rows: [row] });
    await renameSegment('u1', 'seg-1', 'New');
    expect(query.mock.calls[0]?.[1]).toEqual(['seg-1', 'u1', 'New']);
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteSegment('u1', 'seg-1')).toBe(true);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteSegment('u1', 'other')).toBe(false);
    expect(query.mock.calls[2]?.[0]).toContain('user_id = $2');
  });
});

describe('matching queries', () => {
  it('filters candidates by box in SQL and excludes cached results', async () => {
    query.mockResolvedValue({ rows: [] });
    await listUnmatchedCandidates(
      'u1',
      {
        id: 'seg-1',
        activity: 'run',
        lengthM: 1000,
        points: [],
        bounds: { minLat: 40, maxLat: 40.01, minLon: -74.01, maxLon: -74 },
      },
      100,
      0.001
    );
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('jsonb_array_elements');
    expect(sql).toContain("jsonb_typeof(e->'lat') = 'number'");
    expect(params.slice(0, 2)).toEqual(['u1', 'seg-1']);
    expect(params.slice(2, 6).map((n: number) => Number(n.toFixed(4)))).toEqual(
      [39.999, 40.011, -74.011, -73.999]
    );
    expect(params[6]).toBe(100);
  });

  it('reads a track into timestamped fixes and drops malformed ones', async () => {
    query.mockResolvedValue({
      rows: [
        {
          entry_date: '2026-10-16',
          exercise_name: 'Run',
          category: 'cardio',
          notes: null,
          points: [
            { t: '2026-10-16T08:00:00Z', lat: 40, lon: -74, hacc: 5 },
            { t: 'garbage', lat: 40, lon: -74 },
            { t: '2026-10-16T08:00:05Z', lat: 91, lon: -74 },
            { lat: 40, lon: -74 },
            { t: '2026-10-16T08:00:10Z', lat: 40.001, lon: -74 },
          ],
        },
      ],
    });
    const track = await getEntryTrackFixes('u1', 'e1');
    expect(track?.fixes).toEqual([
      { tMs: Date.parse('2026-10-16T08:00:00Z'), lat: 40, lon: -74, hacc: 5 },
      { tMs: Date.parse('2026-10-16T08:00:10Z'), lat: 40.001, lon: -74 },
    ]);
    query.mockResolvedValue({ rows: [] });
    expect(await getEntryTrackFixes('u1', 'none')).toBeNull();
  });

  it('upserts efforts in one transaction, scoped to the owner’s segment', async () => {
    query.mockResolvedValue({ rows: [] });
    await saveEfforts('u1', [
      {
        segmentId: 's1',
        exerciseEntryId: 'e1',
        entryDate: '2026-10-16',
        pass: { startedAtMs: 1000, elapsedSeconds: 250, avgSpeedMps: 4 },
      },
      {
        segmentId: 's1',
        exerciseEntryId: 'e2',
        entryDate: '2026-10-15',
        pass: null,
      },
    ]);
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain(
      'ON CONFLICT (segment_id, exercise_entry_id) DO UPDATE'
    );
    expect(sqls[1]).toContain('s.user_id = $1');
    expect(sqls[3]).toBe('COMMIT');
    expect(query.mock.calls[2]?.[1]?.slice(4)).toEqual([null, null, null]);
    await saveEfforts('u1', []);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('rolls back a failed save', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT')) throw new Error('boom');
      return { rows: [] };
    });
    await expect(
      saveEfforts('u1', [
        {
          segmentId: 's',
          exerciseEntryId: 'e',
          entryDate: '2026-10-16',
          pass: null,
        },
      ])
    ).rejects.toThrow('boom');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('clears an activity’s cached results', async () => {
    query.mockResolvedValue({ rows: [] });
    await clearEntryEfforts('u1', 'e1');
    expect(query.mock.calls[0]?.[1]).toEqual(['e1', 'u1']);
  });

  it('pairs an activity’s efforts with the person’s other times', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            segment_id: 's1',
            entry_id: 'e1',
            entry_date: '2026-10-16',
            started_ms: 1000,
            elapsed_seconds: 250,
            avg_speed_mps: 4,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 's1', name: 'Hill', length_m: 1000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { segment_id: 's1', elapsed_seconds: 260 },
          { segment_id: 's1', elapsed_seconds: 270 },
        ],
      });
    const [ctx] = await listEntryEfforts('u1', 'e1');
    expect(ctx).toMatchObject({
      segmentName: 'Hill',
      segmentLengthM: 1000,
      otherElapsed: [260, 270],
    });
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    expect(await listEntryEfforts('u1', 'e2')).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
