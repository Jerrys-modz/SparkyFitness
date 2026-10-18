import {
  cellAtTap,
  heatCellRadiusM,
  heatmapPeriodFrom,
  regionForBounds,
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

  it('frames the bounds with a margin', () => {
    const region = regionForBounds({
      minLat: 40,
      maxLat: 40.1,
      minLon: -74.1,
      maxLon: -74,
    });
    expect(region?.latitude).toBeCloseTo(40.05, 3);
    expect(region?.latitudeDelta).toBeGreaterThan(0.1);
  });

  it('finds the cell under a tap within a cell and a bit', () => {
    const cells = [{ lat: 40, lon: -74, count: 4 }];
    expect(cellAtTap(cells, 50, 40.0002, -74)?.count).toBe(4);
    expect(cellAtTap(cells, 50, 40.01, -74)).toBeNull();
    expect(heatCellRadiusM(100)).toBeGreaterThan(50);
  });
});
