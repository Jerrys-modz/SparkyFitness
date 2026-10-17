import type { RoutePoint } from '@workspace/shared';
import {
  FOOTPRINT_MAX_LINES,
  FOOTPRINT_MAX_POINTS,
  FOOTPRINT_MAX_ROUTES,
  buildRouteFootprint,
  nearbyRouteIds,
} from '../../src/utils/routeFootprint';

const ORIGIN = { lat: 51.5, lon: -0.12 };
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

const at = (east: number, north: number): RoutePoint => ({
  lat: ORIGIN.lat + north / M_PER_DEG_LAT,
  lon: ORIGIN.lon + east / M_PER_DEG_LON,
});

/** A straight line of `count` points, `step` metres apart, going east from (east0, north). */
const line = (east0: number, north: number, count: number, step = 20) =>
  Array.from({ length: count }, (_, i) => at(east0 + i * step, north));

const mainRoute = { points: line(0, 0, 50) };

describe('buildRouteFootprint', () => {
  it('is empty when there are no other routes or the route is a single point', () => {
    expect(buildRouteFootprint(mainRoute, [])).toEqual([]);
    expect(buildRouteFootprint({ points: [at(0, 0)] }, [mainRoute])).toEqual(
      []
    );
  });

  it('keeps a nearby path as a flat micro-degree line', () => {
    const result = buildRouteFootprint(mainRoute, [
      { points: line(0, 200, 20) },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(40);
    expect(result[0][0]).toBe(Math.round(at(0, 200).lat * 1_000_000));
    expect(result[0][1]).toBe(Math.round(at(0, 200).lon * 1_000_000));
    expect(result[0].every(Number.isInteger)).toBe(true);
  });

  it('drops a path that is far away', () => {
    expect(
      buildRouteFootprint(mainRoute, [{ points: line(0, 20_000, 20) }])
    ).toEqual([]);
  });

  it('clips a path to the part near the route and drops fragments', () => {
    // 100 points, 100 m apart: 10 km long, only the stretch near the route stays.
    const long = { points: line(-5000, 100, 100, 100) };
    const [clipped] = buildRouteFootprint(mainRoute, [long]);
    expect(clipped.length / 2).toBeLessThan(30);
    expect(clipped.length / 2).toBeGreaterThan(2);
    // A 40 m scrap is not worth drawing.
    expect(
      buildRouteFootprint(mainRoute, [{ points: line(0, 100, 3, 20) }])
    ).toEqual([]);
  });

  it('splits a path that leaves and re-enters the area into separate lines', () => {
    const out = [
      ...line(0, 100, 10),
      ...line(0, 30_000, 3),
      ...line(0, 150, 10),
    ];
    expect(buildRouteFootprint(mainRoute, [{ points: out }])).toHaveLength(2);
  });

  it('caps the number of lines, longest first', () => {
    const others = Array.from({ length: 30 }, (_, i) => ({
      points: line(0, 100 + i * 10, 10 + i),
    }));
    const result = buildRouteFootprint(mainRoute, others);
    expect(result).toHaveLength(FOOTPRINT_MAX_LINES);
    const lengths = result.map((l) => l.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
    expect(lengths[0]).toBe((10 + 29) * 2);
  });

  it('caps the total points and thins a long line', () => {
    const others = Array.from({ length: 12 }, (_, i) => ({
      // A zig-zag so simplification cannot collapse it to a straight line.
      points: Array.from({ length: 400 }, (_, j) =>
        at(j * 2, 100 + i * 5 + (j % 2 === 0 ? 0 : 30))
      ),
    }));
    const result = buildRouteFootprint(mainRoute, others);
    const total = result.reduce((n, l) => n + l.length / 2, 0);
    expect(total).toBeLessThanOrEqual(FOOTPRINT_MAX_POINTS);
    expect(result.every((l) => l.length / 2 <= 120)).toBe(true);
    // ~5 bytes a number on the wire: well under the 300 KB per route aim.
    expect(total * 2 * 5).toBeLessThan(8_000);
  });
});

describe('nearbyRouteIds', () => {
  const summary = (id: string, east: number, north: number) => ({
    id,
    start: at(east, north),
  });

  it('keeps routes that start close, nearest first, excluding itself', () => {
    const ids = nearbyRouteIds({ id: 'me', points: mainRoute.points }, [
      summary('far', 0, 40_000),
      summary('me', 0, 0),
      summary('b', 0, 3000),
      summary('a', 0, 500),
      { id: 'nostart', start: null },
    ]);
    expect(ids).toEqual(['a', 'b']);
  });

  it('caps how many are fetched', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      summary(`r${i}`, i * 10, 0)
    );
    expect(
      nearbyRouteIds({ id: 'me', points: mainRoute.points }, many)
    ).toHaveLength(FOOTPRINT_MAX_ROUTES);
  });
});
