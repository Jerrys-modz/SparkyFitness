import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoute,
  listRouteRuns,
  listRoutes,
  setEntryRoute,
} from '../models/routeRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const ROUTE = '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f';
const ENTRY = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';

const routeRow = {
  id: ROUTE,
  name: 'Loop',
  activity: 'run',
  source: 'drawn',
  distance_m: 5000,
  elevation_gain_m: null,
  points: [],
  cues: [],
  source_exercise_entry_id: null,
  run_count: 3,
  best_duration_seconds: 1490,
  last_run_date: '2026-10-16',
  created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-02T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('route run stats', () => {
  it('carries run count, best time and last run on the detail and summaries', async () => {
    query.mockResolvedValue({
      rows: [{ ...routeRow, start: { lat: 1, lon: 2 }, point_count: 40 }],
    });
    const summaries = await listRoutes('u1');
    expect(summaries[0]).toMatchObject({
      runCount: 3,
      bestDurationSeconds: 1490,
      lastRunDate: '2026-10-16',
    });
    expect(String(query.mock.calls[0][0])).toContain('exercise_entries');

    query.mockResolvedValue({ rows: [routeRow] });
    const detail = await getRoute('u1', ROUTE);
    expect(detail).toMatchObject({ runCount: 3, bestDurationSeconds: 1490 });
  });
});

describe('listRouteRuns', () => {
  it('returns null for a route that is not the person’s', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await listRouteRuns('u1', ROUTE)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalled();
  });

  it('maps rows and works out pace from time and distance', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          entry_id: ENTRY,
          entry_date: '2026-10-16',
          duration_seconds: 1500,
          distance_m: 5000,
          avg_heart_rate: 151,
        },
        {
          entry_id: 'e2',
          entry_date: '2026-10-09',
          duration_seconds: 1600,
          distance_m: null,
          avg_heart_rate: null,
        },
      ],
    });
    const runs = await listRouteRuns('u1', ROUTE, 'actor');
    expect(runs).toEqual([
      {
        entryId: ENTRY,
        date: '2026-10-16',
        durationSeconds: 1500,
        distanceM: 5000,
        paceSecPerKm: 300,
        avgHeartRate: 151,
      },
      {
        entryId: 'e2',
        date: '2026-10-09',
        durationSeconds: 1600,
        distanceM: null,
        paceSecPerKm: null,
        avgHeartRate: null,
      },
    ]);
    expect(getClient).toHaveBeenCalledWith('u1', 'actor');
    const sql = String(query.mock.calls[1][0]);
    expect(sql).toMatch(/ORDER BY e\.entry_date DESC/);
  });
});

describe('setEntryRoute', () => {
  it('refuses a route that is not the person’s without touching the entry', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await setEntryRoute('u1', ENTRY, ROUTE)).toBe('route_not_found');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('links an owned entry to an owned route', async () => {
    query.mockResolvedValueOnce({ rows: [{}] });
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await setEntryRoute('u1', ENTRY, ROUTE)).toBe('ok');
    expect(query.mock.calls[1][1]).toEqual([ENTRY, 'u1', ROUTE]);
  });

  it('reports a missing entry', async () => {
    query.mockResolvedValueOnce({ rows: [{}] });
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await setEntryRoute('u1', ENTRY, ROUTE)).toBe('entry_not_found');
  });

  it('clears the link without looking up a route', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await setEntryRoute('u1', ENTRY, null)).toBe('ok');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([ENTRY, 'u1', null]);
  });
});
