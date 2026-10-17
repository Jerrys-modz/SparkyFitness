import {
  distanceToRouteMeters,
  distanceToStartMeters,
  formatStartDistance,
  ON_ROUTE_METERS,
  reachedRoute,
} from '../../src/utils/routeStart';
import { initializeI18n } from '../../src/localization/i18n';

const M_PER_DEG_LAT = 111_195;
/** A point `north` metres from the origin, straight up the meridian. */
const north = (m: number) => ({ lat: 51.5 + m / M_PER_DEG_LAT, lon: -0.12 });
/** A point `east` metres east of the line at `northM`. */
const east = (m: number, northM = 0) => ({
  lat: 51.5 + northM / M_PER_DEG_LAT,
  lon: -0.12 + m / (M_PER_DEG_LAT * Math.cos((51.5 * Math.PI) / 180)),
});

const route = [north(0), north(500), east(500, 500)];

beforeAll(async () => {
  await initializeI18n('en');
});

describe('distanceToRouteMeters', () => {
  it('is the distance to the nearest part of the line, not the nearest vertex', () => {
    // Beside the middle of the first leg, 30 m off it, 250 m from either end.
    expect(distanceToRouteMeters(east(30, 250), route)).toBeCloseTo(30, 0);
  });

  it('is the distance to the end of the line past it', () => {
    expect(distanceToRouteMeters(north(-100), route)).toBeCloseTo(100, 0);
  });

  it('handles a route with no, or one, point', () => {
    expect(distanceToRouteMeters(north(0), [])).toBe(Infinity);
    expect(distanceToRouteMeters(east(50), [north(0)])).toBeCloseTo(50, 0);
  });
});

describe('distanceToStartMeters', () => {
  it('measures to the first point', () => {
    expect(distanceToStartMeters(north(-600), route)).toBeCloseTo(600, 0);
  });

  it('is null for an empty route', () => {
    expect(distanceToStartMeters(north(0), [])).toBeNull();
  });
});

describe('reachedRoute', () => {
  it('is false while every position is farther than the on-route distance', () => {
    const track = [north(-600), north(-300), east(ON_ROUTE_METERS + 20, 100)];
    expect(reachedRoute(track, route)).toBe(false);
  });

  it('is true once any position comes within the on-route distance', () => {
    const track = [north(-600), east(ON_ROUTE_METERS - 5, 100), north(-600)];
    expect(reachedRoute(track, route)).toBe(true);
  });

  it('finds a position near the line wherever it is in the track', () => {
    const track = [north(-600), north(-700), east(10, 100)];
    expect(reachedRoute(track, route)).toBe(true);
  });

  it('is false for an empty track or route', () => {
    expect(reachedRoute([], route)).toBe(false);
    expect(reachedRoute([north(0)], [])).toBe(false);
  });

  it('counts a position just inside the on-route distance but not just outside', () => {
    expect(reachedRoute([east(ON_ROUTE_METERS - 2, 250)], route)).toBe(true);
    expect(reachedRoute([east(ON_ROUTE_METERS + 2, 250)], route)).toBe(false);
  });
});

describe('formatStartDistance', () => {
  it('rounds metres to ten and switches to km at a thousand', () => {
    expect(formatStartDistance(603, 'km')).toBe('600 m');
    expect(formatStartDistance(4, 'km')).toBe('10 m');
    expect(formatStartDistance(1240, 'km')).toBe('1.2 km');
  });

  it('uses feet for short distances and miles for long ones with the miles setting', () => {
    expect(formatStartDistance(100, 'miles')).toBe('330 ft');
    expect(formatStartDistance(1609.344, 'miles')).toBe('1.0 mi');
  });
});
