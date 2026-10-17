import {
  encodeWatchGhost,
  toWatchRoutePayload,
} from '../../src/utils/watchRoute';

const route = {
  id: 'r1',
  name: 'Loop',
  cues: [],
  points: [
    { lat: 51.5, lon: -0.12 },
    { lat: 51.501, lon: -0.12 },
  ],
};

describe('encodeWatchGhost', () => {
  it('passes a rising pace line at the 100 m interval through', () => {
    expect(
      encodeWatchGhost({ intervalM: 100, splits: [30, 61, 61, 95] })
    ).toEqual([30, 61, 61, 95]);
  });

  it('is null with no ghost, an empty line, or a different interval', () => {
    expect(encodeWatchGhost(null)).toBeNull();
    expect(encodeWatchGhost(undefined)).toBeNull();
    expect(encodeWatchGhost({ intervalM: 100, splits: [] })).toBeNull();
    expect(encodeWatchGhost({ intervalM: 50, splits: [10, 20] })).toBeNull();
  });

  it('refuses a line that runs backwards, has fractions, never moves, or is absurdly long', () => {
    expect(encodeWatchGhost({ intervalM: 100, splits: [30, 20] })).toBeNull();
    expect(encodeWatchGhost({ intervalM: 100, splits: [30, 40.5] })).toBeNull();
    expect(encodeWatchGhost({ intervalM: 100, splits: [0, 0] })).toBeNull();
    expect(
      encodeWatchGhost({
        intervalM: 100,
        splits: Array.from({ length: 1001 }, (_, i) => i + 1),
      })
    ).toBeNull();
  });
});

describe('toWatchRoutePayload with a ghost', () => {
  it('adds the pace line beside the points', () => {
    const payload = toWatchRoutePayload(route, [30, 61]);
    expect(payload?.ghost).toEqual([30, 61]);
    expect(payload?.points).toHaveLength(4);
  });

  it('omits the field with no ghost, so an older watch sees the payload it knew', () => {
    expect(toWatchRoutePayload(route)).not.toHaveProperty('ghost');
    expect(toWatchRoutePayload(route, null)).not.toHaveProperty('ghost');
    expect(toWatchRoutePayload(route, [])).not.toHaveProperty('ghost');
  });

  it('adds only a few bytes’ worth to a long route', () => {
    // 100 km at 100 m is 1000 knots of at most five digits.
    const ghost = Array.from({ length: 1000 }, (_, i) => (i + 1) * 30);
    const withGhost = JSON.stringify(toWatchRoutePayload(route, ghost));
    const without = JSON.stringify(toWatchRoutePayload(route));
    expect(withGhost.length - without.length).toBeLessThan(7000);
  });
});
