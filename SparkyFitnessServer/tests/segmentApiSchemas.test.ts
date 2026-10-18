import { describe, expect, it } from 'vitest';
import {
  annotateEfforts,
  createSegmentBodySchema,
  heatmapQuerySchema,
  heatmapResponseSchema,
  segmentAcceptsActivity,
  trackActivityKind,
  updateSegmentBodySchema,
} from '@workspace/shared';

const ID = '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f';
const points = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
];

describe('segment bodies', () => {
  it('accepts points and route forms with defaults', () => {
    const a = createSegmentBodySchema.parse({ mode: 'points', points });
    expect(a).toMatchObject({ mode: 'points', activity: 'run' });
    const b = createSegmentBodySchema.parse({
      mode: 'route',
      routeId: ID,
      startM: 0,
      endM: 400,
    });
    expect(b.mode).toBe('route');
  });

  it('rejects reversed, unnamed-source and out-of-range bodies', () => {
    for (const bad of [
      { mode: 'route', routeId: ID, startM: 400, endM: 400 },
      { mode: 'route', routeId: ID, startM: -1, endM: 400 },
      { mode: 'points', points: [points[0]] },
      { mode: 'points', points: [{ lat: 91, lon: 0 }, points[1]] },
      { mode: 'points', points, activity: 'swim' },
      { mode: 'other' },
    ]) {
      expect(createSegmentBodySchema.safeParse(bad).success).toBe(false);
    }
  });

  it('allows renaming and clearing, not an empty patch', () => {
    expect(updateSegmentBodySchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(updateSegmentBodySchema.safeParse({ name: null }).success).toBe(
      true
    );
    expect(updateSegmentBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('heatmap contract', () => {
  it('validates a response with tuple cells', () => {
    const ok = heatmapResponseSchema.safeParse({
      cellM: 25,
      cells: [[40.1, -74.2, 3]],
      maxCount: 3,
      activityCount: 4,
      truncated: false,
      bounds: { minLat: 40, maxLat: 41, minLon: -75, maxLon: -74 },
      firstDate: '2026-01-01',
      lastDate: null,
    });
    expect(ok.success).toBe(true);
    expect(
      heatmapResponseSchema.safeParse({ cellM: 25, cells: [[1, 2]] }).success
    ).toBe(false);
  });

  it('defaults the cell cap and requires viewport corners together', () => {
    expect(heatmapQuerySchema.parse({}).maxCells).toBe(2000);
    expect(heatmapQuerySchema.safeParse({ minLat: '1' }).success).toBe(false);
  });
});

describe('activity helpers', () => {
  it('classifies the four GPS kinds from the name', () => {
    expect(trackActivityKind({ exerciseName: 'Morning Run' })).toBe('run');
    expect(trackActivityKind({ exerciseName: 'Evening Walk' })).toBe('walk');
    expect(trackActivityKind({ exerciseName: 'Gravel Ride' })).toBe('ride');
    expect(trackActivityKind({ exerciseName: 'Ridge Hike' })).toBe('hike');
    expect(trackActivityKind({ exerciseName: 'Pool swim' })).toBe('excluded');
    expect(trackActivityKind({ exerciseName: 'Evening activity' })).toBe(
      'unknown'
    );
  });

  it('keeps rides and foot activity apart but trusts the unknown', () => {
    expect(segmentAcceptsActivity('run', 'walk')).toBe(true);
    expect(segmentAcceptsActivity('hike', 'run')).toBe(true);
    expect(segmentAcceptsActivity('run', 'ride')).toBe(false);
    expect(segmentAcceptsActivity('ride', 'run')).toBe(false);
    expect(segmentAcceptsActivity('ride', 'ride')).toBe(true);
    expect(segmentAcceptsActivity('run', 'unknown')).toBe(true);
    expect(segmentAcceptsActivity('run', 'excluded')).toBe(false);
  });
});

describe('annotateEfforts', () => {
  it('marks the fastest and each record in time order', () => {
    const result = annotateEfforts([
      { startedAtMs: 3, elapsedSeconds: 290 },
      { startedAtMs: 1, elapsedSeconds: 300 },
      { startedAtMs: 2, elapsedSeconds: 280 },
    ]);
    expect(result.map((r) => r.isBest)).toEqual([false, false, true]);
    expect(result.map((r) => r.isPersonalRecord)).toEqual([false, false, true]);
  });

  it('never calls a first effort a record, and handles none', () => {
    expect(annotateEfforts([{ startedAtMs: 1, elapsedSeconds: 100 }])).toEqual([
      { isBest: true, isPersonalRecord: false },
    ]);
    expect(annotateEfforts([])).toEqual([]);
  });

  it('gives a tie to the earlier effort', () => {
    const result = annotateEfforts([
      { startedAtMs: 1, elapsedSeconds: 100 },
      { startedAtMs: 2, elapsedSeconds: 100 },
    ]);
    expect(result.map((r) => r.isBest)).toEqual([true, false]);
    expect(result.map((r) => r.isPersonalRecord)).toEqual([false, false]);
  });
});
