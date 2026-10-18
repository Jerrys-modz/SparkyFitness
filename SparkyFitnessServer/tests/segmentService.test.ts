import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoutePoint, TrackFix } from '@workspace/shared';
import {
  createSegmentFromBody,
  getEntrySegmentEfforts,
  getSegmentWithEfforts,
  InvalidSegmentError,
  matchSegmentHistory,
  MATCH_BATCH,
  rematchEntryAfterTrackAttach,
  SegmentSourceNotFoundError,
} from '../services/segmentService.js';
import * as repo from '../models/segmentRepository.js';
import { getRoute } from '../models/routeRepository.js';

vi.mock('../models/segmentRepository.js');
vi.mock('../models/routeRepository.js', () => ({ getRoute: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const M = 111194.93;
const COS40 = Math.cos((40 * Math.PI) / 180);
const at = (north: number, east = 0): RoutePoint => ({
  lat: 40 + north / M,
  lon: -74 + east / (M * COS40),
});
const T0 = Date.UTC(2026, 9, 16, 8);

const segment = {
  id: 'seg-1',
  activity: 'run' as const,
  lengthM: 1000,
  points: [at(0), at(1000)],
  bounds: {
    minLat: 40,
    maxLat: 40 + 1000 / M,
    minLon: -74,
    maxLon: -74,
  },
};

function track(fromM: number, toM: number, speed: number): TrackFix[] {
  const out: TrackFix[] = [];
  for (let t = 0; t <= (toM - fromM) / speed; t += 5) {
    out.push({ ...at(fromM + t * speed), tMs: T0 + t * 1000 });
  }
  return out;
}

const candidate = (id: string, name: string | null = 'Morning Run') => ({
  entryId: id,
  entryDate: '2026-10-16',
  exerciseName: name,
  category: 'cardio',
  notes: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repo.saveEfforts).mockResolvedValue(undefined);
});

describe('createSegmentFromBody', () => {
  const line = [at(0), at(500), at(1000)];

  it('stores a segment from points, thinned and measured', async () => {
    vi.mocked(repo.createSegment).mockResolvedValue({ id: 's' } as never);
    await createSegmentFromBody('u1', {
      mode: 'points',
      points: line,
      activity: 'ride',
      name: 'Climb',
      sourceExerciseEntryId: 'e1',
    } as never);
    const input = vi.mocked(repo.createSegment).mock.calls[0]?.[1];
    expect(input).toMatchObject({
      name: 'Climb',
      activity: 'ride',
      sourceExerciseEntryId: 'e1',
      sourceRouteId: null,
    });
    expect(input?.lengthM).toBeCloseTo(1000, 0);
    expect(input?.bounds.maxLat).toBeGreaterThan(input?.bounds.minLat ?? 0);
  });

  it('cuts a stretch of a saved route and takes its activity', async () => {
    vi.mocked(getRoute).mockResolvedValue({
      id: 'r1',
      activity: 'walk',
      points: line,
    } as never);
    vi.mocked(repo.createSegment).mockResolvedValue({ id: 's' } as never);
    await createSegmentFromBody('u1', {
      mode: 'route',
      routeId: 'r1',
      startM: 200,
      endM: 800,
    });
    const input = vi.mocked(repo.createSegment).mock.calls[0]?.[1];
    expect(input?.activity).toBe('walk');
    expect(input?.sourceRouteId).toBe('r1');
    expect(input?.name).toBeNull();
    expect(input?.lengthM).toBeCloseTo(600, 0);
  });

  it('reports a missing route, an empty cut and a too-short segment', async () => {
    vi.mocked(getRoute).mockResolvedValueOnce(null);
    await expect(
      createSegmentFromBody('u1', {
        mode: 'route',
        routeId: 'r',
        startM: 0,
        endM: 500,
      })
    ).rejects.toBeInstanceOf(SegmentSourceNotFoundError);

    vi.mocked(getRoute).mockResolvedValue({
      id: 'r',
      activity: 'run',
      points: line,
    } as never);
    await expect(
      createSegmentFromBody('u1', {
        mode: 'route',
        routeId: 'r',
        startM: 5000,
        endM: 6000,
      })
    ).rejects.toBeInstanceOf(InvalidSegmentError);
    await expect(
      createSegmentFromBody('u1', {
        mode: 'route',
        routeId: 'r',
        startM: 0,
        endM: 50,
      })
    ).rejects.toBeInstanceOf(InvalidSegmentError);
    expect(repo.createSegment).not.toHaveBeenCalled();
  });
});

describe('matchSegmentHistory', () => {
  beforeEach(() => {
    vi.mocked(repo.getMatchableSegment).mockResolvedValue(segment);
  });

  it('is null for a segment that is not theirs', async () => {
    vi.mocked(repo.getMatchableSegment).mockResolvedValue(null);
    expect(await matchSegmentHistory('u1', 'seg-1')).toBeNull();
  });

  it('stores passes and cached misses for each candidate', async () => {
    vi.mocked(repo.listUnmatchedCandidates).mockResolvedValue([
      candidate('e-pass'),
      candidate('e-miss'),
      candidate('e-ride', 'Evening Ride'),
    ]);
    vi.mocked(repo.getEntryTrackFixes).mockImplementation(async (_u, id) => ({
      entryDate: '2026-10-16',
      exerciseName: null,
      category: null,
      notes: null,
      fixes: id === 'e-miss' ? track(0, 400, 4) : track(-50, 1050, 4),
    }));
    const result = await matchSegmentHistory('u1', 'seg-1');
    expect(result).toEqual({ scanned: 3, found: 1, hasMore: false });
    const writes = vi.mocked(repo.saveEfforts).mock.calls[0]?.[1] ?? [];
    expect(writes).toHaveLength(3);
    expect(
      writes.find((w) => w.exerciseEntryId === 'e-pass')?.pass?.elapsedSeconds
    ).toBeCloseTo(250, 0);
    expect(writes.find((w) => w.exerciseEntryId === 'e-miss')?.pass).toBeNull();
    // A ride cannot be an effort on a run segment; its track is not even read.
    expect(writes.find((w) => w.exerciseEntryId === 'e-ride')?.pass).toBeNull();
    expect(repo.getEntryTrackFixes).toHaveBeenCalledTimes(2);
  });

  it('skips tracks whose box never comes near without matching them', async () => {
    vi.mocked(repo.listUnmatchedCandidates).mockResolvedValue([
      candidate('far'),
    ]);
    vi.mocked(repo.getEntryTrackFixes).mockResolvedValue({
      entryDate: '2026-10-16',
      exerciseName: null,
      category: null,
      notes: null,
      fixes: track(0, 1000, 4).map((f) => ({ ...f, lon: f.lon + 1 })),
    });
    const result = await matchSegmentHistory('u1', 'seg-1');
    expect(result?.found).toBe(0);
    expect(vi.mocked(repo.saveEfforts).mock.calls[0]?.[1][0]?.pass).toBeNull();
  });

  it('stops at the time budget and says more is left', async () => {
    vi.mocked(repo.listUnmatchedCandidates).mockResolvedValue([
      candidate('a'),
      candidate('b'),
      candidate('c'),
    ]);
    vi.mocked(repo.getEntryTrackFixes).mockResolvedValue({
      entryDate: '2026-10-16',
      exerciseName: null,
      category: null,
      notes: null,
      fixes: track(-50, 1050, 4),
    });
    let clock = 0;
    const result = await matchSegmentHistory('u1', 'seg-1', undefined, () => {
      clock += 6000;
      return clock;
    });
    expect(result?.hasMore).toBe(true);
    expect(result?.scanned).toBeLessThan(3);
    expect(result?.scanned).toBeGreaterThanOrEqual(1);
  });

  it('says more is left when there was a candidate beyond the batch', async () => {
    const fixes = {
      entryDate: '2026-10-16',
      exerciseName: null,
      category: null,
      notes: null,
      fixes: track(0, 100, 4),
    };
    vi.mocked(repo.getEntryTrackFixes).mockResolvedValue(fixes);
    vi.mocked(repo.listUnmatchedCandidates).mockResolvedValue(
      Array.from({ length: MATCH_BATCH + 1 }, (_, i) => candidate(`e${i}`))
    );
    const more = await matchSegmentHistory('u1', 'seg-1');
    expect(more).toMatchObject({ scanned: MATCH_BATCH, hasMore: true });
    expect(vi.mocked(repo.listUnmatchedCandidates).mock.calls[0]?.[2]).toBe(
      MATCH_BATCH + 1
    );
    vi.mocked(repo.listUnmatchedCandidates).mockResolvedValue(
      Array.from({ length: MATCH_BATCH }, (_, i) => candidate(`e${i}`))
    );
    expect((await matchSegmentHistory('u1', 'seg-1'))?.hasMore).toBe(false);
  });
});

describe('rematchEntryAfterTrackAttach', () => {
  it('clears old results and matches the new track', async () => {
    vi.mocked(repo.listSegmentsToMatchForEntry).mockResolvedValue([segment]);
    vi.mocked(repo.getEntryTrackFixes).mockResolvedValue({
      entryDate: '2026-10-16',
      exerciseName: 'Morning Run',
      category: 'cardio',
      notes: null,
      fixes: track(-50, 1050, 4),
    });
    await rematchEntryAfterTrackAttach('u1', 'e1', 'u1');
    expect(repo.clearEntryEfforts).toHaveBeenCalledWith('u1', 'e1', 'u1');
    const writes = vi.mocked(repo.saveEfforts).mock.calls[0]?.[1] ?? [];
    expect(writes[0]?.pass?.elapsedSeconds).toBeCloseTo(250, 0);
  });

  it('never throws, so a failure cannot undo the save', async () => {
    vi.mocked(repo.clearEntryEfforts).mockRejectedValue(new Error('db down'));
    await expect(
      rematchEntryAfterTrackAttach('u1', 'e1', 'u1')
    ).resolves.toBeUndefined();
  });

  it('does nothing when there are no segments', async () => {
    vi.mocked(repo.listSegmentsToMatchForEntry).mockResolvedValue([]);
    await rematchEntryAfterTrackAttach('u1', 'e1');
    expect(repo.getEntryTrackFixes).not.toHaveBeenCalled();
    expect(repo.saveEfforts).not.toHaveBeenCalled();
  });
});

describe('getSegmentWithEfforts', () => {
  it('marks the best effort and the records, newest first', async () => {
    vi.mocked(repo.getSegmentRow).mockResolvedValue({
      segment: { points: [{ lat: 40, lon: -74 }] } as never,
      summary: { id: 'seg-1' } as never,
    });
    const effort = (entryId: string, day: number, elapsed: number) => ({
      segmentId: 'seg-1',
      entryId,
      date: `2026-10-${day}`,
      startedAtMs: Date.UTC(2026, 9, day),
      elapsedSeconds: elapsed,
      avgSpeedMps: 1000 / elapsed,
    });
    vi.mocked(repo.listSegmentEfforts).mockResolvedValue([
      effort('a', 1, 300),
      effort('b', 2, 310),
      effort('c', 3, 280),
      effort('d', 4, 290),
    ]);
    const result = await getSegmentWithEfforts('u1', 'seg-1');
    expect(result?.points).toEqual([{ lat: 40, lon: -74 }]);
    expect(result?.efforts.map((e) => e.entryId)).toEqual(['d', 'c', 'b', 'a']);
    expect(result?.efforts.map((e) => e.isBest)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(result?.efforts.map((e) => e.isPersonalRecord)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it('is null for a segment that is not theirs', async () => {
    vi.mocked(repo.getSegmentRow).mockResolvedValue(null);
    expect(await getSegmentWithEfforts('u1', 'x')).toBeNull();
  });
});

describe('getEntrySegmentEfforts', () => {
  const ctx = (elapsed: number, others: number[]) => ({
    effort: {
      segmentId: 'seg-1',
      entryId: 'e1',
      date: '2026-10-16',
      startedAtMs: T0,
      elapsedSeconds: elapsed,
      avgSpeedMps: 4,
    },
    segmentName: 'Hill',
    segmentLengthM: 1000,
    otherElapsed: others,
  });

  beforeEach(() => {
    vi.mocked(repo.listSegmentsToMatchForEntry).mockResolvedValue([]);
  });

  it('flags a new best against the other times and reports the one it beat', async () => {
    vi.mocked(repo.listEntryEfforts).mockResolvedValue([ctx(240, [250, 260])]);
    const [effort] = await getEntrySegmentEfforts('u1', 'e1');
    expect(effort).toMatchObject({
      segmentName: 'Hill',
      isNewPersonalBest: true,
      previousBestSeconds: 250,
    });
  });

  it('does not call a slower or first effort a best', async () => {
    vi.mocked(repo.listEntryEfforts).mockResolvedValue([
      ctx(260, [250]),
      ctx(240, []),
    ]);
    const efforts = await getEntrySegmentEfforts('u1', 'e1');
    expect(efforts.map((e) => e.isNewPersonalBest)).toEqual([false, false]);
    expect(efforts.map((e) => e.previousBestSeconds)).toEqual([null, null]);
  });

  it('matches unchecked segments first, and still answers if that fails', async () => {
    vi.mocked(repo.listSegmentsToMatchForEntry).mockRejectedValue(
      new Error('x')
    );
    vi.mocked(repo.listEntryEfforts).mockResolvedValue([]);
    expect(await getEntrySegmentEfforts('u1', 'e1')).toEqual([]);
    expect(repo.listSegmentsToMatchForEntry).toHaveBeenCalled();
  });
});
