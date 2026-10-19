import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeatFix } from '@workspace/shared';
import {
  clearHeatmapCache,
  getHeatmap,
  getHeatmapTracks,
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

const box = (extra: Record<string, unknown> = {}) =>
  ({
    minLat: 39.9,
    maxLat: 40.1,
    minLon: -74.1,
    maxLon: -73.9,
    maxTracks: 300,
    maxPoints: 20000,
    ...extra,
  }) as never;

describe('getHeatmapTracks', () => {
  it('returns simplified lines for the activities in the box, newest first', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([
      entry('a', 'Morning Run', '2026-10-11'),
      entry('b', 'Morning Run', '2026-10-09'),
    ]);
    const result = await getHeatmapTracks('u1', box());
    expect(result.tracks).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.toleranceM).toBe(4);
    // A straight 500 m line collapses to its two ends.
    expect(result.tracks[0]?.[0]).toHaveLength(2);
    expect(result.pointCount).toBe(4);
  });

  it('leaves out activities that do not reach the box', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    const far = await getHeatmapTracks(
      'u1',
      box({ minLat: 10, maxLat: 11, minLon: 10, maxLon: 11 })
    );
    expect(far.tracks).toEqual([]);
    expect(far.truncated).toBe(false);
    const near = await getHeatmapTracks('u1', box());
    expect(near.tracks).toHaveLength(1);
  });

  it('keeps only the parts of a track that reach the box', async () => {
    const t = 1_000_000;
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    vi.mocked(repo.getTrackBatch).mockResolvedValue(
      new Map([
        [
          'a',
          [
            ...line(40, -74, 300).map((f, i) => ({ ...f, tMs: t + i * 3000 })),
            // A pause of an hour, then a second stretch far away.
            ...line(45, -74, 300).map((f, i) => ({
              ...f,
              tMs: t + 3_600_000 + i * 3000,
            })),
          ],
        ],
      ])
    );
    const result = await getHeatmapTracks('u1', box());
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toHaveLength(1);
  });

  it('applies the same activity filter as the grid', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([
      entry('run', 'Morning Run'),
      entry('ride', 'Evening Ride'),
      entry('swim', 'Pool Swim'),
    ]);
    expect(
      (await getHeatmapTracks('u1', box({ activities: ['run'] }))).tracks
    ).toHaveLength(1);
    expect((await getHeatmapTracks('u1', box())).tracks).toHaveLength(2);
  });

  it('stops at the track cap and says so', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue(
      ['a', 'b', 'c', 'd'].map((id) => entry(id, 'Run'))
    );
    const result = await getHeatmapTracks('u1', box({ maxTracks: 3 }));
    expect(result.tracks).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('stops at the point cap and says so', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue(
      ['a', 'b', 'c'].map((id) => entry(id, 'Run'))
    );
    const result = await getHeatmapTracks('u1', box({ maxPoints: 5 }));
    expect(result.tracks).toHaveLength(2);
    expect(result.pointCount).toBe(4);
    expect(result.truncated).toBe(true);
  });

  it('reads the tracks once while they are unchanged, in small batches', async () => {
    const entries = Array.from({ length: HEAT_TRACK_BATCH + 1 }, (_, i) =>
      entry(`e${i}`, 'Run')
    );
    vi.mocked(repo.listHeatEntries).mockResolvedValue(entries);
    await getHeatmapTracks('u1', box());
    await getHeatmapTracks('u1', box({ minLat: 39.95 }));
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(repo.getTrackBatch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(Math.max(...calls.map((c) => c[1].length))).toBe(HEAT_TRACK_BATCH);
  });

  it('rebuilds when the stored tracks change', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmapTracks('u1', box());
    vi.mocked(repo.getHeatStamp).mockResolvedValue({ count: 2, last: 't9' });
    await getHeatmapTracks('u1', box());
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(2);
  });

  it('never mixes people', async () => {
    vi.mocked(repo.listHeatEntries).mockResolvedValue([entry('a', 'Run')]);
    await getHeatmapTracks('u1', box(), 'u1');
    await getHeatmapTracks('u2', box(), 'u2');
    expect(repo.listHeatEntries).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repo.listHeatEntries).mock.calls.map((c) => c[0])).toEqual(
      ['u1', 'u2']
    );
    expect(vi.mocked(repo.getTrackBatch).mock.calls.map((c) => c[0])).toEqual([
      'u1',
      'u2',
    ]);
  });
});
