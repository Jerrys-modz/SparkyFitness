import {
  cellAtTap,
  heatCellRadiusM,
  heatmapMode,
  HEATMAP_LINE_MAX_SPAN_M,
  lineModeWanted,
  regionSpanMeters,
  tapToleranceM,
  tracksAtTap,
  tracksNeedRefetch,
  heatmapPeriodFrom,
  regionForCells,
  viewFromRegion,
  viewInside,
} from '../../src/utils/heatmapDisplay';

describe('heatmap display', () => {
  it('turns a period into a first day, none for all time', () => {
    expect(heatmapPeriodFrom('30d', '2026-10-30')).toBe('2026-10-01');
    expect(heatmapPeriodFrom('90d', '2026-10-30')).toBe('2026-08-02');
    expect(heatmapPeriodFrom('1y', '2026-10-30')).toBe('2025-10-31');
    expect(heatmapPeriodFrom('all', '2026-10-30')).toBeUndefined();
  });

  it('pads and rounds the view so a small pan stays inside it', () => {
    const region = {
      latitude: 40,
      longitude: -74,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
    const view = viewFromRegion(region);
    expect(view.minLat).toBeLessThan(39.985);
    expect(view.maxLat).toBeGreaterThan(40.015);
    expect(view.minLat).toBe(Math.floor(view.minLat * 1000) / 1000);
    expect(viewInside(region, view)).toBe(true);
    expect(viewInside({ ...region, latitude: 40.005 }, view)).toBe(true);
    expect(viewInside({ ...region, latitude: 40.1 }, view)).toBe(false);
    expect(viewInside({ ...region, latitudeDelta: 0.3 }, view)).toBe(false);
    expect(viewInside(region, undefined)).toBe(false);
  });

  it('keeps the view on the globe', () => {
    const view = viewFromRegion({
      latitude: 89.9,
      longitude: 179.9,
      latitudeDelta: 1,
      longitudeDelta: 1,
    });
    expect(view.maxLat).toBe(90);
    expect(view.maxLon).toBe(180);
  });

  it('frames where the heat is, with a margin', () => {
    const region = regionForCells([
      [40.0, -74.1, 3],
      [40.1, -74.0, 3],
    ]);
    expect(region?.latitude).toBeCloseTo(40.05, 2);
    expect(region?.latitudeDelta).toBeGreaterThan(0.1);
  });

  it('does not let one far trip set the zoom', () => {
    const home = Array.from(
      { length: 40 },
      (_, i) => [40 + i * 0.0005, -74 + i * 0.0005, 20] as const
    );
    const region = regionForCells([...home, [34.0, -118.2, 1]]);
    expect(region?.latitude).toBeCloseTo(40.01, 1);
    expect(region?.latitudeDelta).toBeLessThan(0.1);
  });

  it('has no region without cells', () => {
    expect(regionForCells([])).toBeNull();
  });

  it('finds the cell under a tap within a cell and a bit', () => {
    const cells = [{ lat: 40, lon: -74, count: 4 }];
    expect(cellAtTap(cells, 50, 40.0002, -74)?.count).toBe(4);
    expect(cellAtTap(cells, 50, 40.01, -74)).toBeNull();
    expect(heatCellRadiusM(100)).toBeGreaterThan(50);
  });
});

describe('heatmap line mode', () => {
  const at = (latitude: number, delta: number) => ({
    latitude,
    longitude: -74,
    latitudeDelta: delta,
    longitudeDelta: delta,
  });

  it('measures the map across in metres, narrower in longitude away from the equator', () => {
    expect(regionSpanMeters(at(0, 0.01))).toBeCloseTo(1113.2, 0);
    // At 60 degrees a degree of longitude is half as long, so the height wins.
    expect(regionSpanMeters(at(60, 0.01))).toBeCloseTo(1113.2, 0);
  });

  it('wants lines under the threshold and not at it', () => {
    expect(lineModeWanted(null)).toBe(false);
    expect(lineModeWanted(at(40, 0.02))).toBe(true);
    expect(lineModeWanted(at(40, 0.03))).toBe(false);
    const justUnder = HEATMAP_LINE_MAX_SPAN_M / 111_320 - 1e-5;
    expect(lineModeWanted(at(0, justUnder))).toBe(true);
    expect(lineModeWanted(at(0, HEATMAP_LINE_MAX_SPAN_M / 111_320))).toBe(
      false
    );
  });

  it('draws lines only for a whole answer to a zoomed-in map', () => {
    const near = at(40, 0.01);
    const far = at(40, 0.5);
    expect(heatmapMode(near, { truncated: false }, false)).toBe('lines');
    expect(heatmapMode(far, { truncated: false }, false)).toBe('grid');
    expect(heatmapMode(null, { truncated: false }, false)).toBe('grid');
    expect(heatmapMode(near, undefined, false)).toBe('grid');
    expect(heatmapMode(near, { truncated: true }, false)).toBe('grid');
    expect(heatmapMode(near, { truncated: false }, true)).toBe('grid');
  });

  it('fetches again on leaving the box, or on zooming well into a truncated one', () => {
    const view = {
      minLat: 39.99,
      maxLat: 40.02,
      minLon: -74.015,
      maxLon: -73.985,
    };
    const inside = at(40.005, 0.01);
    expect(tracksNeedRefetch(inside, undefined, false)).toBe(true);
    expect(tracksNeedRefetch(inside, view, false)).toBe(false);
    expect(tracksNeedRefetch(at(40.3, 0.01), view, false)).toBe(true);
    // Truncated, and the view is now well under half the box: try a tighter one.
    expect(tracksNeedRefetch(at(40.005, 0.004), view, true)).toBe(true);
    expect(tracksNeedRefetch(at(40.005, 0.004), view, false)).toBe(false);
    expect(tracksNeedRefetch(at(40.005, 0.02), view, true)).toBe(false);
  });

  it('reaches a fingertip wide, between 10 and 60 m', () => {
    expect(tapToleranceM(at(40, 0.0005))).toBe(10);
    expect(tapToleranceM(at(40, 0.02))).toBeCloseTo(44.5, 0);
    expect(tapToleranceM(at(40, 0.2))).toBe(60);
  });

  it('counts the tracks under a tap, each once', () => {
    const street: [number, number][] = [
      [40, -74],
      [40.004, -74],
    ];
    const tracks = [
      [street],
      [street, street],
      [
        [
          [40, -74.002],
          [40.004, -74.002],
        ] as [number, number][],
      ],
    ];
    const region = at(40.002, 0.01);
    expect(tracksAtTap(tracks, region, 40.002, -74)).toBe(2);
    expect(tracksAtTap(tracks, region, 40.002, -74.002)).toBe(1);
    expect(tracksAtTap(tracks, region, 40.002, -74.01)).toBe(0);
  });
});
