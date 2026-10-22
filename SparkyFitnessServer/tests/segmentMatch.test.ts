import { describe, expect, it } from 'vitest';
import {
  bestSegmentPass,
  distanceAlongRoute,
  findSegmentPasses,
  haversineMeters,
  isSegmentPersonalBest,
  pointAtDistance,
  prepareSegment,
  sliceRouteByDistance,
  trackMayCrossSegment,
  routeBounds,
  routeDistanceMeters,
  type RoutePoint,
  type TrackFix,
} from '@workspace/shared';

const M_PER_DEG_LAT = 111194.93;
const COS40 = Math.cos((40 * Math.PI) / 180);

/** A point `northM` metres north and `eastM` metres east of (40, -74). */
const at = (northM: number, eastM = 0): RoutePoint => ({
  lat: 40 + northM / M_PER_DEG_LAT,
  lon: -74 + eastM / (M_PER_DEG_LAT * COS40),
});

const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);

/** The straight 1 km segment: from 0 m to 1000 m north. */
const segment = {
  points: [at(0), at(1000)],
  lengthM: routeDistanceMeters([at(0), at(1000)]),
};

/**
 * A track moving north at `speed` m/s with a fix every `step` seconds, from
 * `fromM` to `toM`, offset `eastM` to the side. `startSeconds` shifts the clock.
 */
function northTrack(
  fromM: number,
  toM: number,
  speed: number,
  step: number,
  {
    eastM = 0,
    startSeconds = 0,
    hacc,
  }: { eastM?: number; startSeconds?: number; hacc?: number } = {}
): TrackFix[] {
  const fixes: TrackFix[] = [];
  const duration = (toM - fromM) / speed;
  for (let t = 0; t <= duration + 1e-9; t += step) {
    const p = at(fromM + t * speed, eastM);
    fixes.push({
      ...p,
      tMs: T0 + (startSeconds + t) * 1000,
      ...(hacc !== undefined ? { hacc } : {}),
    });
  }
  return fixes;
}

describe('findSegmentPasses', () => {
  it('times a clean pass by interpolating the crossings', () => {
    // 4 m/s over 1 km is 250 s; fixes every 10 s from 100 m before the start.
    const track = northTrack(-103, 1105, 4, 10);
    const pass = bestSegmentPass(segment, track);
    expect(pass).not.toBeNull();
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 4, 0);
    expect(pass?.avgSpeedMps).toBeCloseTo(4, 1);
  });

  it('finds the crossing times even when no fix lies on the gates', () => {
    const track = northTrack(-7.3, 1013.1, 5, 3);
    const pass = bestSegmentPass(segment, track);
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 5, 0);
    // The start crossing is when the runner was at 0 m: 7.3 m / 5 m/s into the track.
    expect(((pass?.startMs ?? 0) - T0) / 1000).toBeCloseTo(7.3 / 5, 1);
  });

  it('ignores a pass in the wrong direction', () => {
    const reversed = northTrack(-50, 1050, 4, 5).map((f, i, all) => ({
      ...(all[all.length - 1 - i] as TrackFix),
      tMs: f.tMs,
    }));
    expect(findSegmentPasses(segment, reversed)).toEqual([]);
  });

  it('accepts a pass within the corridor and rejects one outside it', () => {
    expect(
      bestSegmentPass(segment, northTrack(-50, 1050, 4, 5, { eastM: 15 }))
    ).not.toBeNull();
    expect(
      bestSegmentPass(segment, northTrack(-50, 1050, 4, 5, { eastM: 60 }))
    ).toBeNull();
  });

  it('honours a wider tolerance', () => {
    const side = northTrack(-50, 1050, 4, 5, { eastM: 40 });
    expect(bestSegmentPass(segment, side)).toBeNull();
    expect(bestSegmentPass(segment, side, { toleranceM: 50 })).not.toBeNull();
  });

  it('ignores a pass whose fixes have a poor accuracy radius', () => {
    // Fixes 16 to 34 (about 270 m to 630 m) reports 90 m accuracy, leaving a hole.
    const track = northTrack(-50, 1050, 4, 5).map((f, i) => ({
      ...f,
      hacc: i > 15 && i < 35 ? 90 : 5,
    }));
    expect(findSegmentPasses(segment, track)).toEqual([]);
  });

  it('keeps a pass when a single poor fix is dropped but the gap stays small', () => {
    const track = northTrack(-50, 1050, 4, 5).map((f, i) => ({
      ...f,
      hacc: i === 30 ? 90 : 5,
    }));
    const pass = bestSegmentPass(segment, track);
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 4, 0);
  });

  it('ignores a pass with a long gap between fixes', () => {
    const track = northTrack(-50, 1050, 4, 5).filter(
      (_, i) => i < 20 || i > 30
    );
    expect(findSegmentPasses(segment, track)).toEqual([]);
    expect(
      findSegmentPasses(segment, track, { maxGapSeconds: 120, maxGapM: 500 })
    ).toHaveLength(1);
  });

  it('ignores an impossible jump', () => {
    const track = northTrack(-50, 1050, 4, 5);
    // One fix lands 140 m ahead of where it should be (28 m/s) and the next is back on pace.
    const jumped = track.map((f, i) =>
      i === 30 ? { ...f, ...at(-50 + 30 * 20 + 140) } : f
    );
    expect(findSegmentPasses(segment, jumped, { maxSpeedMps: 25 })).toEqual([]);
  });

  it('rejects a track that turns around inside the corridor', () => {
    const out = northTrack(-50, 600, 4, 5);
    const back = northTrack(300, 600, 4, 5)
      .reverse()
      .map((f, i) => ({
        ...f,
        tMs: (out[out.length - 1] as TrackFix).tMs + (i + 1) * 5000,
      }));
    const lastT = (back[back.length - 1] as TrackFix).tMs;
    const again = northTrack(300, 1050, 4, 5).map((f, i) => ({
      ...f,
      tMs: lastT + (i + 1) * 5000,
    }));
    expect(findSegmentPasses(segment, [...out, ...back, ...again])).toEqual([]);
  });

  it('times a slow pass through ordinary GPS jitter', () => {
    // Walking pace with 5 m of noise either way: the recorded path is far
    // longer than the real one, but the effort is still timed.
    let seed = 7;
    const noise = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296 - 0.5) * 10;
    };
    const fixes: TrackFix[] = [];
    for (let t = 0; t <= 900; t++) {
      fixes.push({
        ...at(-60 + t * 1.3 + noise(), noise()),
        tMs: T0 + t * 1000,
      });
    }
    const pass = bestSegmentPass(segment, fixes);
    expect(pass).not.toBeNull();
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 1.3, -1);
  });

  it('counts time spent standing still inside the segment', () => {
    const moving = northTrack(-50, 1050, 4, 5);
    // 20 s stopped at 500 m: fixes keep coming, the clock keeps running.
    const stopped = moving.map((f, i) => {
      if (i < 28) return f;
      return { ...f, tMs: f.tMs + 20_000 };
    });
    const standing = [...stopped];
    for (const t of [5, 10, 15]) {
      standing.push({
        ...at(500),
        tMs: (moving[27] as TrackFix).tMs + t * 1000,
      });
    }
    const pass = bestSegmentPass(segment, standing);
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 4 + 20, 0);
  });

  it('finds two laps and picks the faster', () => {
    const slow = northTrack(-50, 1050, 3, 5);
    const slowEnd = (slow[slow.length - 1] as TrackFix).tMs;
    const fast = northTrack(-50, 1050, 5, 5).map((f) => ({
      ...f,
      tMs: f.tMs - T0 + slowEnd + 600_000,
    }));
    const passes = findSegmentPasses(segment, [...slow, ...fast]);
    expect(passes).toHaveLength(2);
    expect(passes[0]?.elapsedSeconds).toBeGreaterThan(
      passes[1]?.elapsedSeconds ?? 0
    );
    expect(
      bestSegmentPass(segment, [...slow, ...fast])?.avgSpeedMps
    ).toBeCloseTo(5, 1);
  });

  it('times a recording that begins just past the start of the segment', () => {
    const track = northTrack(10, 1060, 4, 5);
    const pass = bestSegmentPass(segment, track);
    expect(pass?.elapsedSeconds).toBeCloseTo(segment.lengthM / 4, 0);
  });

  it('does not accept a recording that begins in the middle of the segment', () => {
    expect(bestSegmentPass(segment, northTrack(400, 1050, 4, 5))).toBeNull();
  });

  it('follows a bent segment', () => {
    const bent = [at(0), at(500), at(500, 500)];
    const geometry = { points: bent, lengthM: routeDistanceMeters(bent) };
    const fixes: TrackFix[] = [];
    // 500 m north then 500 m east, 4 m/s, a fix every 5 s, 40 m of run-in.
    for (let t = 0; t <= 290; t += 5) {
      const along = -40 + t * 4;
      const p = along <= 500 ? at(along) : at(500, along - 500);
      fixes.push({ ...p, tMs: T0 + t * 1000 });
    }
    const pass = bestSegmentPass(geometry, fixes);
    expect(pass?.elapsedSeconds).toBeCloseTo(geometry.lengthM / 4, 0);
  });

  it('returns nothing for a track that never gets near', () => {
    expect(
      findSegmentPasses(segment, northTrack(-50, 1050, 4, 5, { eastM: 500 }))
    ).toEqual([]);
  });

  it('copes with empty, tiny and unsorted input', () => {
    expect(findSegmentPasses(segment, [])).toEqual([]);
    expect(findSegmentPasses(segment, [{ ...at(0), tMs: T0 }])).toEqual([]);
    expect(
      findSegmentPasses(
        { points: [at(0)], lengthM: 0 },
        northTrack(0, 100, 4, 5)
      )
    ).toEqual([]);
    const shuffled = [...northTrack(-50, 1050, 4, 5)].reverse();
    expect(bestSegmentPass(segment, shuffled)?.elapsedSeconds).toBeCloseTo(
      segment.lengthM / 4,
      0
    );
  });

  it('drops non-finite fixes', () => {
    const track = northTrack(-50, 1050, 4, 5);
    track.splice(20, 0, { lat: Number.NaN, lon: -74, tMs: T0 + 1 });
    expect(bestSegmentPass(segment, track)).not.toBeNull();
  });
});

describe('segment geometry helpers', () => {
  const line = [at(0), at(500), at(1000)];

  it('finds a point a distance along a line', () => {
    const mid = pointAtDistance(line, 750);
    expect(haversineMeters(mid as RoutePoint, at(750))).toBeLessThan(1);
    expect(pointAtDistance(line, -5)).toEqual(line[0]);
    expect(pointAtDistance(line, 99999)).toEqual(line[2]);
    expect(pointAtDistance([], 5)).toBeNull();
  });

  it('cuts a stretch with exact ends', () => {
    const cut = sliceRouteByDistance(line, 250, 750);
    expect(cut).not.toBeNull();
    expect(routeDistanceMeters(cut as RoutePoint[])).toBeCloseTo(500, 0);
    expect(
      haversineMeters((cut as RoutePoint[])[0] as RoutePoint, at(250))
    ).toBeLessThan(1);
    // It keeps the vertex between the cut ends.
    expect(cut).toHaveLength(3);
  });

  it('refuses an empty or reversed cut', () => {
    expect(sliceRouteByDistance(line, 600, 600)).toBeNull();
    expect(sliceRouteByDistance(line, 800, 200)).toBeNull();
    expect(sliceRouteByDistance(line, 2000, 3000)).toBeNull();
    expect(sliceRouteByDistance([at(0)], 0, 10)).toBeNull();
  });

  it('places a point along the line', () => {
    expect(distanceAlongRoute(line, at(300, 5))).toBeCloseTo(300, 0);
    expect(distanceAlongRoute(line, at(2000))).toBeCloseTo(1000, 0);
    expect(distanceAlongRoute([at(0)], at(5))).toBe(0);
  });

  it('prepares a stored segment and enforces the length bounds', () => {
    const prepared = prepareSegment(line);
    expect(prepared?.lengthM).toBeCloseTo(1000, 0);
    expect(prepared?.bounds.minLat).toBeLessThan(prepared?.bounds.maxLat ?? 0);
    expect(prepareSegment([at(0), at(50)])).toBeNull();
    expect(prepareSegment([at(0), at(150000)])).toBeNull();
    expect(prepareSegment([at(0)])).toBeNull();
  });

  it('thins a long segment to the stored point cap', () => {
    const wiggly: RoutePoint[] = [];
    for (let i = 0; i <= 3000; i++) wiggly.push(at(i * 2, (i % 2) * 8));
    const prepared = prepareSegment(wiggly);
    expect(prepared?.points.length).toBeLessThanOrEqual(400);
    expect(prepared?.lengthM).toBeGreaterThan(5000);
  });

  it('prefilters tracks by bounding box', () => {
    const seg = routeBounds(line);
    const near = routeBounds(northTrack(-500, 2000, 4, 30, { eastM: 10 }));
    const far = routeBounds(northTrack(-500, 2000, 4, 30, { eastM: 5000 }));
    expect(seg && near && trackMayCrossSegment(seg, near)).toBe(true);
    expect(seg && far && trackMayCrossSegment(seg, far)).toBe(false);
  });

  it('calls a time a personal best only when it beats every other', () => {
    expect(isSegmentPersonalBest(200, [210, 250])).toBe(true);
    expect(isSegmentPersonalBest(210, [210, 250])).toBe(false);
    expect(isSegmentPersonalBest(200, [])).toBe(false);
    expect(isSegmentPersonalBest(200, [Number.NaN, 0])).toBe(false);
  });
});
