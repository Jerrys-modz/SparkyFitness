import { describe, expect, it } from 'vitest';
import { buildGhostSplits } from '@workspace/shared';

// 0.0009° of latitude is about 100.07 m, so these steps are 100 m apart.
const DEG_PER_100M = 0.0008993;
const at = (seconds: number, hundreds: number) => ({
  t: new Date(Date.UTC(2026, 9, 16, 8, 0, seconds)).toISOString(),
  lat: 40 + hundreds * DEG_PER_100M,
  lon: -74,
});

describe('buildGhostSplits', () => {
  it('reads the time at each 100 m off the track', () => {
    const result = buildGhostSplits({
      track: [at(0, 0), at(30, 1), at(70, 2), at(120, 3)],
      routeDistanceM: 300,
      durationSeconds: 120,
    });
    expect(result?.source).toBe('track');
    expect(result?.intervalM).toBe(100);
    expect(result?.splits).toEqual([30, 70, 120]);
  });

  it('stretches the track to the route length and its clock to the logged time', () => {
    // The track is 300 m and 120 s long; the route is 600 m and the logged time 240 s.
    const result = buildGhostSplits({
      track: [at(0, 0), at(30, 1), at(70, 2), at(120, 3)],
      routeDistanceM: 600,
      durationSeconds: 240,
    });
    expect(result?.splits).toHaveLength(6);
    expect(result?.splits[1]).toBe(60);
    expect(result?.splits[5]).toBe(240);
  });

  it('ends on the route’s own length when it is not a multiple of 100 m', () => {
    const result = buildGhostSplits({
      track: null,
      routeDistanceM: 250,
      durationSeconds: 100,
    });
    expect(result).toEqual({
      source: 'constant_pace',
      intervalM: 100,
      splits: [40, 80, 100],
    });
  });

  it('falls back to an even pace for a track that is too short, standing still or out of order', () => {
    const base = { routeDistanceM: 200, durationSeconds: 100 };
    const even = [50, 100];
    expect(buildGhostSplits({ ...base, track: [at(0, 0)] })?.splits).toEqual(
      even
    );
    expect(
      buildGhostSplits({ ...base, track: [at(0, 0), at(60, 0)] })?.source
    ).toBe('constant_pace');
    expect(
      buildGhostSplits({
        ...base,
        track: [{ t: 'nope', lat: 40, lon: -74 }, at(5, 1)],
      })?.source
    ).toBe('constant_pace');
  });

  it('never runs backwards when fixes repeat a timestamp', () => {
    const result = buildGhostSplits({
      track: [at(0, 0), at(30, 1), at(30, 1.5), at(20, 1.8), at(60, 2)],
      routeDistanceM: 200,
      durationSeconds: 60,
    });
    const splits = result?.splits ?? [];
    for (let i = 1; i < splits.length; i++) {
      expect(splits[i]).toBeGreaterThanOrEqual(splits[i - 1]);
    }
    expect(splits[splits.length - 1]).toBe(60);
  });

  it('gives nothing for a route with no length or a run with no time', () => {
    expect(
      buildGhostSplits({ track: null, routeDistanceM: 0, durationSeconds: 60 })
    ).toBeNull();
    expect(
      buildGhostSplits({ track: null, routeDistanceM: 500, durationSeconds: 0 })
    ).toBeNull();
  });
});
