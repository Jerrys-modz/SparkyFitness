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

describe('parseGpx work bound', () => {
  // Each input is a few MB of the kind of markup that makes a backtracking
  // expression quadratic. A linear scan finishes in milliseconds; the old
  // regular expression took seconds to minutes on these.
  const within = (ms: number, gpx: string): ReturnType<typeof parseGpx> => {
    const started = Date.now();
    const parsed = parseGpx(gpx);
    expect(Date.now() - started).toBeLessThan(ms);
    return parsed;
  };

  it('copes with many unclosed point tags', () => {
    const parsed = within(
      1500,
      '<gpx>' + '<trkpt lat="1" lon="1">'.repeat(150_000)
    );
    expect(parsed.points).toEqual([]);
  });

  it('copes with many point openers that never end', () => {
    expect(within(1500, '<trkpt '.repeat(300_000)).points).toEqual([]);
    expect(within(1500, '<rtept lat="1" '.repeat(150_000)).points).toEqual([]);
  });

  it('copes with many track and CDATA openers and no names', () => {
    expect(within(1500, '<trk '.repeat(400_000)).name).toBeNull();
    expect(
      within(1500, '<trk><name>' + '<![CDATA['.repeat(150_000) + '</name>').name
    ).not.toBeNull();
  });

  it('copes with many elevation openers inside one point', () => {
    const body = '<ele>'.repeat(200_000);
    const parsed = within(1500, `<trkpt lat="1" lon="2">${body}</trkpt>`);
    expect(parsed.points).toEqual([{ lat: 1, lon: 2 }]);
  });

  it('still reads a large well-formed file', () => {
    const pts = Array.from(
      { length: 100_000 },
      (_, i) =>
        `<trkpt lat="${40 + (i % 100) / 1000}" lon="-74"><ele>${i % 50}</ele></trkpt>`
    ).join('');
    const parsed = within(2000, `<gpx><trk><name>Big</name>${pts}</trk></gpx>`);
    expect(parsed.points).toHaveLength(100_000);
    expect(parsed.name).toBe('Big');
  });

  it('keeps reading points, names and elevation as before', () => {
    const parsed = parseGpx(
      `<gpx><metadata><name><![CDATA[Trail & <b>]]></name></metadata>
       <trk><trkseg>
         <trkpt lat="40" lon="-74"><ele>12.5</ele></trkpt>
         <trkpt lat='41' lon='-73'/>
         <trkpt lat="95" lon="1"/>
         <trkpt lat="42" lon="-72"><ele>99999</ele></trkpt>
       </trkseg></trk></gpx>`
    );
    expect(parsed.name).toBe('Trail & <b>');
    expect(parsed.points).toEqual([
      { lat: 40, lon: -74, alt: 12.5 },
      { lat: 41, lon: -73 },
      { lat: 42, lon: -72 },
    ]);
  });
});
