import { describe, expect, it } from 'vitest';
import {
  HEATMAP_TRACK_PART_MAX_POINTS,
  boundsOverlap,
  countTracksNear,
  heatPartBounds,
  simplifyHeatTrack,
  type HeatFix,
  type HeatTrack,
} from '@workspace/shared';

const M_PER_DEG = 111_320;
const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);

/** Fixes every 5 m north from (lat, lon), one every 3 s. */
function line(
  lat: number,
  lon: number,
  lengthM: number,
  startMs = T0
): HeatFix[] {
  return Array.from({ length: Math.floor(lengthM / 5) + 1 }, (_, i) => ({
    lat: lat + (i * 5) / M_PER_DEG,
    lon,
    tMs: startMs + i * 3000,
  }));
}

describe('simplifyHeatTrack', () => {
  it('collapses a straight recording to its ends', () => {
    const parts = simplifyHeatTrack(line(40, -74, 1000));
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
  });

  it('keeps a corner', () => {
    const north = line(40, -74, 200);
    const end = north[north.length - 1] as HeatFix;
    const east = Array.from({ length: 41 }, (_, i) => ({
      lat: end.lat,
      lon: end.lon + (i * 5) / (M_PER_DEG * Math.cos((40 * Math.PI) / 180)),
      tMs: (end.tMs ?? 0) + (i + 1) * 3000,
    }));
    const parts = simplifyHeatTrack([...north, ...east]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(3);
  });

  it('cuts at a pause and at a jump', () => {
    const first = line(40, -74, 200);
    const afterPause = line(40.01, -74, 200, T0 + 3_600_000);
    expect(simplifyHeatTrack([...first, ...afterPause])).toHaveLength(2);
    const afterJump = line(40.2, -74, 200, T0 + first.length * 3000);
    expect(simplifyHeatTrack([...first, ...afterJump])).toHaveLength(2);
  });

  it('drops inaccurate and invalid fixes', () => {
    const fixes: HeatFix[] = [
      ...line(40, -74, 100),
      { lat: 40.5, lon: -74, hacc: 500, tMs: T0 + 1000 },
      { lat: 0, lon: 0 },
      { lat: Number.NaN, lon: -74 },
    ];
    const parts = simplifyHeatTrack(fixes);
    expect(parts).toHaveLength(1);
    const box = heatPartBounds(parts[0] ?? []);
    expect(box.maxLat).toBeLessThan(40.01);
  });

  it('drops tracks that never went anywhere', () => {
    const still: HeatFix[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 40 + (i % 2) * 1e-6,
      lon: -74,
      tMs: T0 + i * 1000,
    }));
    expect(simplifyHeatTrack(still)).toEqual([]);
    expect(simplifyHeatTrack([])).toEqual([]);
    expect(simplifyHeatTrack(line(40, -74, 0))).toEqual([]);
  });

  it('caps the points of a winding part', () => {
    const zigzag: HeatFix[] = Array.from({ length: 3000 }, (_, i) => ({
      lat: 40 + (i * 20) / M_PER_DEG,
      lon: -74 + (i % 2 === 0 ? 0 : 60 / M_PER_DEG),
    }));
    const parts = simplifyHeatTrack(zigzag);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(HEATMAP_TRACK_PART_MAX_POINTS);
    }
  });

  it('rounds to about a metre', () => {
    const [part] = simplifyHeatTrack(line(40.123456789, -74.987654321, 100));
    for (const [lat, lon] of part ?? []) {
      expect(Math.abs(lat * 1e5 - Math.round(lat * 1e5))).toBeLessThan(1e-6);
      expect(Math.abs(lon * 1e5 - Math.round(lon * 1e5))).toBeLessThan(1e-6);
    }
  });
});

describe('boundsOverlap', () => {
  const a = { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };
  it('is true for overlapping and touching boxes', () => {
    expect(
      boundsOverlap(a, { minLat: 0.5, maxLat: 2, minLon: 0.5, maxLon: 2 })
    ).toBe(true);
    expect(
      boundsOverlap(a, { minLat: 1, maxLat: 2, minLon: 1, maxLon: 2 })
    ).toBe(true);
  });
  it('is false for apart boxes', () => {
    expect(
      boundsOverlap(a, { minLat: 2, maxLat: 3, minLon: 0, maxLon: 1 })
    ).toBe(false);
    expect(
      boundsOverlap(a, { minLat: 0, maxLat: 1, minLon: 1.1, maxLon: 2 })
    ).toBe(false);
  });
});

describe('countTracksNear', () => {
  // Three activities: two on the same street, one a block east.
  const street: HeatTrack = [
    [
      [40, -74],
      [40.01, -74],
    ],
  ];
  const next: HeatTrack = [
    [
      [40, -74.002],
      [40.01, -74.002],
    ],
  ];
  const tracks = [street, street, next];

  it('counts the activities passing within the distance', () => {
    expect(countTracksNear(tracks, 40.005, -74, 20)).toBe(2);
    expect(countTracksNear(tracks, 40.005, -74.002, 20)).toBe(1);
  });

  it('counts a tap within reach beside the line, not beyond it', () => {
    const lonM = M_PER_DEG * Math.cos((40 * Math.PI) / 180);
    expect(countTracksNear(tracks, 40.005, -74 + 15 / lonM, 20)).toBe(2);
    expect(countTracksNear(tracks, 40.005, -74 + 40 / lonM, 20)).toBe(0);
  });

  it('measures to the segment, not just the vertices', () => {
    // 5 km from either end of the segment but 0 m from its middle.
    expect(countTracksNear([street], 40.005, -74, 5)).toBe(1);
  });

  it('counts an activity once however many parts are close', () => {
    const twice: HeatTrack = [
      [
        [40, -74],
        [40.01, -74],
      ],
      [
        [40.01, -74.00001],
        [40, -74.00001],
      ],
    ];
    expect(countTracksNear([twice], 40.005, -74, 20)).toBe(1);
  });

  it('is zero with nothing to count', () => {
    expect(countTracksNear([], 40, -74, 20)).toBe(0);
    expect(countTracksNear([[]], 40, -74, 20)).toBe(0);
  });
});
