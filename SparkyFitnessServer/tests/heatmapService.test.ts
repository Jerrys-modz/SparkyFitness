import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeatFix } from '@workspace/shared';
import {
  clearHeatmapCache,
  getHeatmap,
  HEAT_TRACK_BATCH,
} from '../services/heatmapService.js';
import * as repo from '../models/heatmapRepository.js';

vi.mock('../models/heatmapRepository.js');

const M_PER_DEG = 111_320;
const line = (lat: number, lon: number, lengthM: number): HeatFix[] =>
  Array.from({ length: Math.floor(lengthM / 10) + 1 }, (_, i) => ({
    lat: lat + (i * 10) / M_PER_DEG,
    lon,
    tMs: 1_000_000 + i * 3000,
  }));

const entry = (id: string, name: string, date = '2026-10-10') => ({
  entryId: id,
  entryDate: date,
  exerciseName: name,
  category: 'cardio',
  notes: null,
});

const query = (extra: Record<string, unknown> = {}) =>
  ({ maxCells: 2000, ...extra }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  clearHeatmapCache();
  vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 1, last: 't1' });
  vi.mocked(repo.getTrackBatch).mockImplementation(async (_u, ids) => {
    const out = new Map<string, HeatFix[]>();
    for (const id of ids) out.set(id, line(40, -74, 500));
    return out;
  });
});

describe('getHeatmap', () => {
  it('counts every activity that passed a cell', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([
      entry('a', 'Morning Run', '2026-10-09'),
      entry('b', 'Morning Run', '2026-10-11'),
    ]);
    const result = await getHeatmap('u1', query());
    expect(result.activityCount).toBe(2);
    expect(result.maxCount).toBe(2);
    expect(result.cellM).toBe(25);
    expect(result.firstDate).toBe('2026-10-09');
    expect(result.lastDate).toBe('2026-10-11');
    expect(result.truncated).toBe(false);
    expect(result.bounds).not.toBeNull();
    expect(result.cells.every(([, , n]) => n >= 1 && n <= 2)).toBe(true);
  });

  it('keeps to the chosen kinds; unnamed activities count only for “all”', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([
      entry('run', 'Morning Run'),
      entry('ride', 'Evening Ride'),
      entry('swim', 'Pool Swim'),
    ]);
    const onlyRuns = await getHeatmap('u1', query({ activities: ['run'] }));
    expect(onlyRuns.activityCount).toBe(1);
    clearHeatmapCache();
    // With no filter every GPS kind counts, but a swim never does.
    expect((await getHeatmap('u1', query())).activityCount).toBe(2);
    clearHeatmapCache();
    vi.mocked(repo.listHeatEntries).mockResolvedValue([
      entry('run', 'Morning Run'),
      entry('who', 'Evening activity'),
    ]);
    expect((await getHeatmap('u1', query())).activityCount).toBe(2);
    clearHeatmapCache();
    expect(
      (await getHeatmap('u1', query({ activities: ['run'] }))).activityCount
    ).toBe(1);
  });

  it('streams tracks a few at a time', async () => {
    const entries = Array.from({ length: HEAT_TRACK_BATCH * 2 + 1 }, (_, i) =>
      entry(`e${i}`, 'Run')
    );
    vi.mocked(repo.listHeatEntries).mockResolvedValue(entries);
    await getHeatmap('u1', query());
    const calls = vi.mocked(repo.getTrackBatch).mock.calls;
    expect(calls).toHaveLength(3);
    expect(Math.max(...calls.map((c) => c[1].length))).toBe(HEAT_TRACK_BATCH);
  });

  it('serves a second view from the cache while the tracks are unchanged', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmap('u1', query());
    await getHeatmap(
      'u1',
      query({ minLat: 39, maxLat: 41, minLon: -75, maxLon: -73 })
    );
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(1);
    expect(repo.getTrackBatch).toHaveBeenCalledTimes(1);
  });

  it('rebuilds when the stored tracks change', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmap('u1', query());
    vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 2, last: 't9' });
    await getHeatmap('u1', query());
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(2);
  });

  it('adds only the new activities when nothing else changed', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValueOnce([entry('a', 'Run')]);
    const first = await getHeatmap('u1', query());
    vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 2, last: 't2' });
    vi.mocked(repo.countHeatRowsAfter).mockResolvedValue(1);
    vi.mocked(repo.listHeatEntries).mockResolvedValueOnce([
      entry('b', 'Run', '2026-10-20'),
    ]);
    const second = await getHeatmap('u1', query());
    expect(second.activityCount).toBe(2);
    expect(second.lastDate).toBe('2026-10-20');
    expect(second.maxCount).toBe(first.maxCount + 1);
    // The second listing asked only for tracks changed since the first stamp.
    expect(vi.mocked(repo.listHeatEntries).mock.calls[1]?.[4]).toBe('t1');
    expect(repo.getTrackBatch).toHaveBeenLastCalledWith('u1', ['b'], undefined);
  });

  it('rebuilds when a track was replaced or removed, not just added', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmap('u1', query());
    // Same count, one track changed: a replacement.
    vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 1, last: 't2' });
    vi.mocked(repo.countHeatRowsAfter).mockResolvedValue(1);
    await getHeatmap('u1', query());
    expect(vi.mocked(repo.listHeatEntries).mock.calls[1]?.[4]).toBeUndefined();
    // One removed and two added: count +1 but two changed.
    vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 2, last: 't3' });
    vi.mocked(repo.countHeatRowsAfter).mockResolvedValue(2);
    await getHeatmap('u1', query());
    expect(vi.mocked(repo.listHeatEntries).mock.calls[2]?.[4]).toBeUndefined();
  });

  it('keeps people and filters apart', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmap('u1', query());
    await getHeatmap('u2', query());
    await getHeatmap('u1', query({ from: '2026-01-01' }));
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(3);
    expect(vi.mocked(repo.listHeatEntries).mock.calls[2]?.[1]).toBe(
      '2026-01-01'
    );
  });

  it('shares one build between simultaneous requests', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await Promise.all([getHeatmap('u1', query()), getHeatmap('u1', query())]);
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(1);
  });

  it('cuts to the view and respects the cell cap', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    const far = await getHeatmap(
      'u1',
      query({ minLat: 10, maxLat: 11, minLon: 10, maxLon: 11 })
    );
    expect(far.cells).toEqual([]);
    clearHeatmapCache();
    const capped = await getHeatmap('u1', query({ maxCells: 50 }));
    expect(capped.cells.length).toBeLessThanOrEqual(50);
  });

  it('copes with no tracks and with tracks too short to draw', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([]);
    const empty = await getHeatmap('u1', query());
    expect(empty).toMatchObject({
      cells: [],
      activityCount: 0,
      bounds: null,
      firstDate: null,
      lastDate: null,
    });
    clearHeatmapCache();
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    vi.mocked(repo.getTrackBatch).mockResolvedValue(
      new Map([['a', [{ lat: 40, lon: -74 }]]])
    );
    expect((await getHeatmap('u1', query())).activityCount).toBe(0);
  });
});
