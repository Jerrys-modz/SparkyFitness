import { describe, expect, it } from 'vitest';
import {
  haversineMeters,
  parseGpx,
  routeDistanceMeters,
  routeElevationGainMeters,
  serializeGpx,
  simplifyRoute,
  type RoutePoint,
} from '@workspace/shared';
import { InvalidRouteError, prepareRoute } from '../utils/routePrep.js';

// ~111 m per 0.001 degree of latitude.
const line = (n: number): RoutePoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 40 + i * 0.001, lon: -74 }));

describe('route geometry', () => {
  it('measures distance along the path', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(routeDistanceMeters(line(11))).toBeGreaterThan(1100);
    expect(routeDistanceMeters(line(11))).toBeLessThan(1120);
  });

  it('ignores altitude wobble but counts real climbs', () => {
    const wobble = [0, 1, 0, 1, 0].map((alt) => ({ lat: 0, lon: 0, alt }));
    expect(routeElevationGainMeters(wobble)).toBe(0);
    const climb = [0, 5, 10, 20].map((alt) => ({ lat: 0, lon: 0, alt }));
    expect(routeElevationGainMeters(climb)).toBe(20);
    expect(routeElevationGainMeters(line(3))).toBeNull();
  });

  it('simplifies a straight line to its ends and caps the point count', () => {
    const straight = simplifyRoute(line(100), 2000);
    expect(straight.sourceIndexes).toEqual([0, 99]);
    const wiggly: RoutePoint[] = Array.from({ length: 5000 }, (_, i) => ({
      lat: 40 + i * 0.0001,
      lon: -74 + (i % 2) * 0.0003,
    }));
    expect(simplifyRoute(wiggly, 300).points.length).toBeLessThanOrEqual(300);
  });
});

describe('simplifyRoute work bound', () => {
  it('handles a 50,000-point zigzag quickly', () => {
    const zigzag: RoutePoint[] = Array.from({ length: 50000 }, (_, i) => ({
      lat: 40 + i * 0.0001,
      lon: -74 + (i % 2) * 0.0003,
    }));
    const started = Date.now();
    const result = simplifyRoute(zigzag, 2000);
    expect(result.points.length).toBeLessThanOrEqual(2000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('prepareRoute', () => {
  it('measures the full track and re-points cues at kept points', () => {
    const prepared = prepareRoute(line(100), [
      { index: 10, kind: 'left' },
      { index: 99, kind: 'arrive' },
    ]);
    expect(prepared.points).toHaveLength(2);
    expect(prepared.distanceM).toBeGreaterThan(10000);
    expect(prepared.cues.map((c) => c.index)).toEqual([0, 1]);
  });

  it('drops cues past the end of the track', () => {
    const prepared = prepareRoute(line(20), [{ index: 500, kind: 'left' }]);
    expect(prepared.cues).toEqual([]);
  });

  it('rejects tracks under 10 m', () => {
    expect(() => prepareRoute([line(1)[0], line(1)[0]])).toThrow(
      InvalidRouteError
    );
  });
});

describe('GPX', () => {
  const sample = `<?xml version="1.0"?>
<gpx version="1.1"><metadata><name>Meta</name></metadata>
<trk><name>Loop &amp; back</name><trkseg>
<trkpt lat="40.0" lon="-74.0"><ele>10.5</ele><time>2026-01-01T00:00:00Z</time></trkpt>
<trkpt lat="40.001" lon="-74.0"/>
<trkpt lat="95" lon="-74.0"><ele>1</ele></trkpt>
<trkpt lat="40.002" lon="-74.0"><ele>12</ele></trkpt>
</trkseg></trk></gpx>`;

  it('reads name, points and elevation, dropping invalid points', () => {
    const parsed = parseGpx(sample);
    expect(parsed.name).toBe('Loop & back');
    expect(parsed.points).toEqual([
      { lat: 40, lon: -74, alt: 10.5 },
      { lat: 40.001, lon: -74 },
      { lat: 40.002, lon: -74, alt: 12 },
    ]);
  });

  it('falls back to route points', () => {
    const parsed = parseGpx(
      '<gpx><rte><name>R</name><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte></gpx>'
    );
    expect(parsed.points).toHaveLength(2);
  });

  it('round-trips through serialize', () => {
    const points = parseGpx(sample).points;
    const again = parseGpx(serializeGpx('A <b>', points));
    expect(again.name).toBe('A <b>');
    expect(again.points).toEqual(points);
  });
});
