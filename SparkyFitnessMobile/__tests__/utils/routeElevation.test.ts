import type { RoutePoint } from '@workspace/shared';
import {
  hasRouteElevation,
  routeElevationProfile,
} from '../../src/utils/routeElevation';

/** A line north, a point every ~111 m (0.001 degrees). */
const line = (alts: (number | undefined)[]): RoutePoint[] =>
  alts.map((alt, i) => ({
    lat: 51.5 + i * 0.001,
    lon: -0.12,
    ...(alt === undefined ? {} : { alt }),
  }));

describe('hasRouteElevation', () => {
  it('is false for a route with no altitude at all', () => {
    expect(hasRouteElevation(line([undefined, undefined, undefined]))).toBe(
      false
    );
  });

  it('is false for fewer than two points or fewer than two altitudes', () => {
    expect(hasRouteElevation(line([10]))).toBe(false);
    expect(hasRouteElevation(line([10, undefined]))).toBe(false);
  });

  it('needs at least half the points to carry an altitude', () => {
    expect(hasRouteElevation(line([10, undefined, undefined, 12]))).toBe(true);
    expect(
      hasRouteElevation(line([10, undefined, undefined, undefined, 12]))
    ).toBe(false);
  });
});

describe('routeElevationProfile', () => {
  it('returns null rather than inventing a flat line', () => {
    expect(
      routeElevationProfile(line([undefined, undefined]), 'km')
    ).toBeNull();
    expect(routeElevationProfile([], 'km')).toBeNull();
  });

  it('plots distance in km and height in metres', () => {
    const profile = routeElevationProfile(line([100, 110, 105]), 'km');
    expect(profile).not.toBeNull();
    expect(profile!.samples).toHaveLength(3);
    expect(profile!.samples[0]).toEqual({ distance: 0, elevation: 100 });
    expect(profile!.samples[1].distance).toBeCloseTo(0.111, 2);
    expect(profile!.samples[2].distance).toBeCloseTo(0.222, 2);
    expect(profile!.minElevation).toBe(100);
    expect(profile!.maxElevation).toBe(110);
  });

  it('plots miles and feet with the miles setting', () => {
    const profile = routeElevationProfile(line([100, 200]), 'miles')!;
    expect(profile.samples[1].distance).toBeCloseTo(0.069, 2);
    expect(profile.samples[0].elevation).toBeCloseTo(328.084, 2);
    expect(profile.maxElevation).toBeCloseTo(656.168, 2);
  });

  it('keeps a point without an altitude out, at its true distance', () => {
    const profile = routeElevationProfile(line([100, undefined, 120]), 'km')!;
    expect(profile.samples).toHaveLength(2);
    expect(profile.samples[1].distance).toBeCloseTo(0.222, 2);
    expect(profile.samples[1].elevation).toBe(120);
  });

  it('thins a dense route but keeps its ends', () => {
    const alts = Array.from({ length: 1000 }, (_, i) => i / 10);
    const profile = routeElevationProfile(line(alts), 'km')!;
    expect(profile.samples.length).toBeLessThanOrEqual(160);
    expect(profile.samples[0].elevation).toBe(0);
    expect(profile.samples[profile.samples.length - 1].elevation).toBeCloseTo(
      99.9,
      5
    );
    expect(profile.maxElevation).toBeCloseTo(99.9, 5);
  });
});
