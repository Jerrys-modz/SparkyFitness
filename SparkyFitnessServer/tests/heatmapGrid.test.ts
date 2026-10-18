import { describe, expect, it } from 'vitest';
import {
  HEATMAP_BASE_CELL_M,
  addTrackToHeatGrid,
  coarsenHeatGrid,
  heatCellCenter,
  heatCellKey,
  heatGridBounds,
  heatIntensityClass,
  nearestHeatCell,
  sliceHeatGrid,
  type HeatFix,
  type HeatGrid,
} from '@workspace/shared';

const M_PER_DEG = 111_320;
const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);

/** A straight line north from (lat, lon), `lengthM` long, fixes every `stepM`. */
function line(
  lat: number,
  lon: number,
  lengthM: number,
  stepM: number
): HeatFix[] {
  const out: HeatFix[] = [];
  for (let m = 0; m <= lengthM; m += stepM) {
    out.push({ lat: lat + m / M_PER_DEG, lon, tMs: T0 + m * 250 });
  }
  return out;
}

describe('heat cells', () => {
  it('puts a position in a cell whose centre is close by', () => {
    for (const [lat, lon] of [
      [40.7128, -74.006],
      [-33.8688, 151.2093],
      [64.1466, -21.9426],
      [0.0001, 0.0001],
    ] as const) {
      const key = heatCellKey(lat, lon, 25);
      const c = heatCellCenter(key, 25);
      expect(Math.abs(c.lat - lat) * M_PER_DEG).toBeLessThan(26);
      expect(
        Math.abs(c.lon - lon) * M_PER_DEG * Math.cos((lat * Math.PI) / 180)
      ).toBeLessThan(26);
      expect(heatCellKey(c.lat, c.lon, 25)).toBe(key);
    }
  });

  it('gives neighbouring positions different cells and the same position the same one', () => {
    expect(heatCellKey(40, -74, 25)).toBe(heatCellKey(40, -74, 25));
    expect(heatCellKey(40, -74, 25)).not.toBe(heatCellKey(40.01, -74, 25));
  });
});

describe('addTrackToHeatGrid', () => {
  it('counts an activity once per cell however many fixes land there', () => {
    const grid: HeatGrid = new Map();
    // Fixes every 2 m: many fixes per 25 m cell.
    addTrackToHeatGrid(grid, line(40, -74, 500, 2));
    expect(Math.max(...grid.values())).toBe(1);
    expect(grid.size).toBeGreaterThanOrEqual(19);
    expect(grid.size).toBeLessThanOrEqual(23);
  });

  it('counts each pass over the same road', () => {
    const grid: HeatGrid = new Map();
    for (let i = 0; i < 3; i++) addTrackToHeatGrid(grid, line(40, -74, 500, 5));
    expect(Math.max(...grid.values())).toBe(3);
  });

  it('fills the stretch between sparse fixes', () => {
    const dense: HeatGrid = new Map();
    const sparse: HeatGrid = new Map();
    addTrackToHeatGrid(dense, line(40, -74, 400, 5));
    addTrackToHeatGrid(sparse, line(40, -74, 400, 100));
    expect(sparse.size).toBeGreaterThanOrEqual(dense.size - 2);
  });

  it('does not draw across a long gap in time or space', () => {
    const grid: HeatGrid = new Map();
    const fixes: HeatFix[] = [
      ...line(40, -74, 100, 10),
      // 2 km further on, ten minutes later: the person was elsewhere (a tunnel, a pause).
      ...line(40 + 2000 / M_PER_DEG, -74, 100, 10).map((f) => ({
        ...f,
        tMs: (f.tMs ?? 0) + 600_000,
      })),
    ];
    addTrackToHeatGrid(grid, fixes);
    expect(grid.size).toBeLessThan(12);
  });

  it('skips fixes with a poor accuracy radius and impossible coordinates', () => {
    const grid: HeatGrid = new Map();
    const touched = addTrackToHeatGrid(grid, [
      { lat: 40, lon: -74, hacc: 400 },
      { lat: Number.NaN, lon: -74 },
      { lat: 0, lon: 0 },
      { lat: 95, lon: 0 },
    ]);
    expect(touched).toBe(0);
    expect(grid.size).toBe(0);
  });

  it('handles an empty track', () => {
    const grid: HeatGrid = new Map();
    expect(addTrackToHeatGrid(grid, [])).toBe(0);
  });
});

describe('near-duplicate fixes', () => {
  it('gives the same cells as the full track without visiting every fix', () => {
    const dense = line(40, -74, 600, 1);
    const sparse = line(40, -74, 600, 10);
    const a: HeatGrid = new Map();
    const b: HeatGrid = new Map();
    addTrackToHeatGrid(a, dense);
    addTrackToHeatGrid(b, sparse);
    expect(a.size).toBe(b.size);
    expect(new Set(a.keys())).toEqual(new Set(b.keys()));
  });

  it('keeps the last fix and counts a person standing still once', () => {
    const grid: HeatGrid = new Map();
    const still: HeatFix[] = Array.from({ length: 200 }, (_, i) => ({
      lat: 40 + (i % 2) * 0.00001,
      lon: -74,
      tMs: T0 + i * 1000,
    }));
    still.push({ lat: 40.0005, lon: -74, tMs: T0 + 201_000 });
    addTrackToHeatGrid(grid, still);
    expect(grid.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...grid.values())).toBe(1);
  });
});

describe('coarsenHeatGrid and sliceHeatGrid', () => {
  const grid: HeatGrid = new Map();
  for (let i = 0; i < 4; i++) {
    addTrackToHeatGrid(grid, line(40, -74, 3000, 10));
  }
  addTrackToHeatGrid(grid, line(40.1, -74.1, 1000, 10));

  it('takes the busiest child when merging cells', () => {
    const coarse = coarsenHeatGrid(grid, HEATMAP_BASE_CELL_M, 200);
    expect(coarse.size).toBeLessThan(grid.size);
    expect(Math.max(...coarse.values())).toBe(4);
  });

  it('returns the same grid for a size that is not larger', () => {
    expect(coarsenHeatGrid(grid, 25, 25)).toBe(grid);
  });

  it('keeps the finest size while the view fits the cap', () => {
    const slice = sliceHeatGrid(grid, 25, null, 5000);
    expect(slice.cellM).toBe(25);
    expect(slice.truncated).toBe(false);
    expect(slice.maxCount).toBe(4);
  });

  it('picks a coarser size to stay under the cap', () => {
    const slice = sliceHeatGrid(grid, 25, null, 60);
    expect(slice.cellM).toBeGreaterThan(25);
    expect(slice.cells.length).toBeLessThanOrEqual(60);
    expect(slice.truncated).toBe(false);
  });

  it('truncates to the busiest cells when even the coarsest size is too many', () => {
    const slice = sliceHeatGrid(grid, 25, null, 2, [25, 50]);
    expect(slice.cells).toHaveLength(2);
    expect(slice.truncated).toBe(true);
    expect(slice.cells.every((c) => c.count === 4)).toBe(true);
  });

  it('limits the slice to the view', () => {
    const view = {
      minLat: 40.09,
      maxLat: 40.12,
      minLon: -74.11,
      maxLon: -74.09,
    };
    const slice = sliceHeatGrid(grid, 25, view, 5000);
    expect(slice.cells.length).toBeGreaterThan(0);
    expect(slice.cells.every((c) => c.lat > 40.05)).toBe(true);
    expect(slice.maxCount).toBe(1);
  });

  it('never exceeds the hard cap whatever the caller asks', () => {
    const slice = sliceHeatGrid(grid, 25, null, 10_000_000);
    expect(slice.cells.length).toBeLessThanOrEqual(5000);
  });

  it('handles an empty grid', () => {
    const slice = sliceHeatGrid(new Map(), 25, null);
    expect(slice).toEqual({
      cellM: 25,
      cells: [],
      maxCount: 0,
      truncated: false,
    });
    expect(heatGridBounds(new Map(), 25)).toBeNull();
  });

  it('bounds the grid', () => {
    const bounds = heatGridBounds(grid, 25);
    expect(bounds?.minLat).toBeLessThan(40.01);
    expect(bounds?.maxLat).toBeGreaterThan(40.1);
  });
});

describe('nearestHeatCell and intensity', () => {
  const cells = [
    { lat: 40, lon: -74, count: 3 },
    { lat: 40.001, lon: -74, count: 7 },
  ];

  it('finds the cell near a tap and nothing far away', () => {
    expect(nearestHeatCell(cells, 40.00005, -74, 30)?.count).toBe(3);
    expect(nearestHeatCell(cells, 40.00098, -74, 30)?.count).toBe(7);
    expect(nearestHeatCell(cells, 41, -74, 30)).toBeNull();
    expect(nearestHeatCell([], 40, -74, 30)).toBeNull();
  });

  it('grades counts on a log scale', () => {
    expect(heatIntensityClass(1, 100, 4)).toBe(0);
    expect(heatIntensityClass(100, 100, 4)).toBe(3);
    expect(heatIntensityClass(10, 100, 4)).toBeGreaterThan(
      heatIntensityClass(1, 100, 4)
    );
    expect(heatIntensityClass(0, 100, 4)).toBe(0);
    expect(heatIntensityClass(5, 0, 4)).toBe(0);
  });
});
