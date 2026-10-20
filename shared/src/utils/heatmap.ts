import type { RoutePoint } from '../schemas/api/Route.api.zod.ts';
import {
  distanceToSegment,
  localProjector,
  routeDistanceMeters,
  simplifyRoute,
  type RouteBounds,
} from './routeGeometry.ts';

/*
 * A personal heatmap is a grid of roughly square cells; each cell counts the
 * activities that passed through it. The grid is built once per person at the
 * finest size and coarsened for a wider view, so panning and zooming never
 * touch the stored tracks again.
 */

/** The finest cell, in metres. */
export const HEATMAP_BASE_CELL_M = 25;
/** Cell sizes a response may use, finest first. */
export const HEATMAP_CELL_LEVELS_M = [
  25, 50, 100, 200, 400, 800, 1600, 3200, 6400,
] as const;
/** A response never carries more cells than this. */
export const HEATMAP_MAX_CELLS = 5000;
export const HEATMAP_MIN_CELLS = 50;

const M_PER_DEG_LAT = 111_320;
const ROW_OFFSET = 1_000_000;
const COL_OFFSET = 2_000_000;
const ROW_STRIDE = 4_000_000;

/** One recorded fix; `tMs` is optional because only the position matters. */
export interface HeatFix {
  lat: number;
  lon: number;
  tMs?: number;
  /** Horizontal accuracy radius in metres, when reported. */
  hacc?: number;
}

/** Cell key to the number of activities that passed through it. */
export type HeatGrid = Map<number, number>;

export interface HeatCell {
  lat: number;
  lon: number;
  count: number;
}

function latStepDeg(cellM: number): number {
  return cellM / M_PER_DEG_LAT;
}

function lonStepDeg(row: number, cellM: number): number {
  const lat = (row + 0.5) * latStepDeg(cellM);
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  return cellM / (M_PER_DEG_LAT * cos);
}

function encode(row: number, col: number): number {
  return (row + ROW_OFFSET) * ROW_STRIDE + (col + COL_OFFSET);
}

/** The cell key containing a position at the given cell size. */
export function heatCellKey(lat: number, lon: number, cellM: number): number {
  const row = Math.floor(lat / latStepDeg(cellM));
  const col = Math.floor(lon / lonStepDeg(row, cellM));
  return encode(row, col);
}

/** The centre of a cell. */
export function heatCellCenter(
  key: number,
  cellM: number
): { lat: number; lon: number } {
  const rowPlus = Math.floor(key / ROW_STRIDE);
  const row = rowPlus - ROW_OFFSET;
  const col = key - rowPlus * ROW_STRIDE - COL_OFFSET;
  return {
    lat: (row + 0.5) * latStepDeg(cellM),
    lon: (col + 0.5) * lonStepDeg(row, cellM),
  };
}

export interface AddTrackOptions {
  cellM?: number;
  /** Fixes with a worse accuracy radius are skipped. */
  maxAccuracyM?: number;
  /** A hole longer than this in time breaks the line (a pause, a tunnel). */
  maxGapSeconds?: number;
  /** ...or longer than this in space. */
  maxGapM?: number;
}

const DEFAULT_ADD: Required<AddTrackOptions> = {
  cellM: HEATMAP_BASE_CELL_M,
  maxAccuracyM: 100,
  maxGapSeconds: 300,
  maxGapM: 500,
};

function approxMeters(a: HeatFix, b: HeatFix): number {
  const dLat = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dLon =
    (b.lon - a.lon) *
    M_PER_DEG_LAT *
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

function validFix(f: HeatFix, maxAccuracyM: number): boolean {
  return (
    Number.isFinite(f.lat) &&
    Number.isFinite(f.lon) &&
    Math.abs(f.lat) <= 90 &&
    Math.abs(f.lon) <= 180 &&
    !(f.lat === 0 && f.lon === 0) &&
    (f.hacc === undefined || f.hacc <= maxAccuracyM)
  );
}

/**
 * Adds one activity to `grid`: every cell its line passes through gains one,
 * however many fixes fell in it. Stretches between fixes are filled in, so a
 * sparse track leaves no holes, except across a gap (see `AddTrackOptions`).
 * Returns the number of cells the activity touched.
 */
export function addTrackToHeatGrid(
  grid: HeatGrid,
  fixes: readonly HeatFix[],
  options: AddTrackOptions = {}
): number {
  const opt = { ...DEFAULT_ADD, ...options };
  const visited = new Set<number>();
  const step = opt.cellM / 2;
  // A fix closer than this to the last one used adds nothing the line between
  // them does not, and a recording at 1 Hz has several per cell.
  const skipWithin = opt.cellM / 5;
  let prev: HeatFix | null = null;
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i] as HeatFix;
    if (!validFix(fix, opt.maxAccuracyM)) continue;
    if (prev && i < fixes.length - 1 && approxMeters(prev, fix) < skipWithin) {
      continue;
    }
    visited.add(heatCellKey(fix.lat, fix.lon, opt.cellM));
    if (prev) {
      const meters = approxMeters(prev, fix);
      const seconds =
        prev.tMs !== undefined && fix.tMs !== undefined
          ? (fix.tMs - prev.tMs) / 1000
          : 0;
      const broken = meters > opt.maxGapM || seconds > opt.maxGapSeconds;
      if (!broken && meters > step) {
        const pieces = Math.ceil(meters / step);
        for (let k = 1; k < pieces; k++) {
          const t = k / pieces;
          visited.add(
            heatCellKey(
              prev.lat + (fix.lat - prev.lat) * t,
              prev.lon + (fix.lon - prev.lon) * t,
              opt.cellM
            )
          );
        }
      }
    }
    prev = fix;
  }
  for (const key of visited) grid.set(key, (grid.get(key) ?? 0) + 1);
  return visited.size;
}

/**
 * The same grid at a larger cell size. A coarse cell takes the highest count
 * among the fine cells inside it, because one activity crossing several fine
 * cells is still one pass.
 */
export function coarsenHeatGrid(
  grid: HeatGrid,
  fromM: number,
  toM: number
): HeatGrid {
  if (toM <= fromM) return grid;
  const out: HeatGrid = new Map();
  for (const [key, count] of grid) {
    const c = heatCellCenter(key, fromM);
    const coarse = heatCellKey(c.lat, c.lon, toM);
    const existing = out.get(coarse);
    if (existing === undefined || count > existing) out.set(coarse, count);
  }
  return out;
}

/** The box around every cell, or null for an empty grid. */
export function heatGridBounds(
  grid: HeatGrid,
  cellM: number
): RouteBounds | null {
  let bounds: RouteBounds | null = null;
  for (const key of grid.keys()) {
    const { lat, lon } = heatCellCenter(key, cellM);
    if (!bounds) {
      bounds = { minLat: lat, maxLat: lat, minLon: lon, maxLon: lon };
    } else {
      bounds.minLat = Math.min(bounds.minLat, lat);
      bounds.maxLat = Math.max(bounds.maxLat, lat);
      bounds.minLon = Math.min(bounds.minLon, lon);
      bounds.maxLon = Math.max(bounds.maxLon, lon);
    }
  }
  return bounds;
}

export interface HeatSlice {
  cellM: number;
  cells: HeatCell[];
  /** The highest count among the cells in the slice. */
  maxCount: number;
  /** True when cells were left out to stay under the cap. */
  truncated: boolean;
}

function inBox(
  lat: number,
  lon: number,
  box: RouteBounds,
  padM: number
): boolean {
  const latPad = padM / M_PER_DEG_LAT;
  const lonPad =
    padM / (M_PER_DEG_LAT * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return (
    lat >= box.minLat - latPad &&
    lat <= box.maxLat + latPad &&
    lon >= box.minLon - lonPad &&
    lon <= box.maxLon + lonPad
  );
}

/**
 * The cells to draw for a view: inside `view` (all of the grid when null) at
 * the finest size from `levels` that fits `maxCells`. If even the coarsest
 * size does not fit, the busiest cells are kept and `truncated` is set.
 */
export function sliceHeatGrid(
  grid: HeatGrid,
  baseCellM: number,
  view: RouteBounds | null,
  maxCells: number = HEATMAP_MAX_CELLS,
  levels: readonly number[] = HEATMAP_CELL_LEVELS_M
): HeatSlice {
  const cap = Math.max(1, Math.min(maxCells, HEATMAP_MAX_CELLS));
  const usable = levels.filter((l) => l >= baseCellM);
  const sizes = usable.length > 0 ? usable : [baseCellM];
  let chosen: { cellM: number; cells: HeatCell[] } | null = null;
  for (const cellM of sizes) {
    const level = coarsenHeatGrid(grid, baseCellM, cellM);
    const cells: HeatCell[] = [];
    for (const [key, count] of level) {
      const { lat, lon } = heatCellCenter(key, cellM);
      if (view && !inBox(lat, lon, view, cellM)) continue;
      cells.push({ lat, lon, count });
    }
    chosen = { cellM, cells };
    if (cells.length <= cap) break;
  }
  const picked = chosen ?? { cellM: baseCellM, cells: [] };
  let cells = picked.cells;
  let truncated = false;
  if (cells.length > cap) {
    cells = [...cells].sort((a, b) => b.count - a.count).slice(0, cap);
    truncated = true;
  }
  return {
    cellM: picked.cellM,
    cells,
    maxCount: cells.reduce((m, c) => Math.max(m, c.count), 0),
    truncated,
  };
}

/** The cell nearest a tapped position, if one lies within `maxDistanceM`. */
export function nearestHeatCell(
  cells: readonly HeatCell[],
  lat: number,
  lon: number,
  maxDistanceM: number
): HeatCell | null {
  let best: HeatCell | null = null;
  let bestD = maxDistanceM;
  for (const cell of cells) {
    const d = approxMeters({ lat, lon }, cell);
    if (d <= bestD) {
      best = cell;
      bestD = d;
    }
  }
  return best;
}

/** Colour class 0 to `classes - 1` for a count, on a log scale so one busy road does not wash out the rest. */
export function heatIntensityClass(
  count: number,
  maxCount: number,
  classes: number
): number {
  if (count <= 0 || maxCount <= 0 || classes <= 1) return 0;
  const ratio = Math.log(1 + count) / Math.log(1 + maxCount);
  return Math.min(classes - 1, Math.floor(ratio * classes));
}

/*
 * Tracks as lines. At street level a native map draws the person's own
 * simplified tracks instead of grid cells, so overlaps add up to brighter
 * lines. A track is a list of parts (a pause or a jump starts a new one);
 * a part is a list of `[lat, lon]` points.
 */

/** One point of a drawn track: latitude, longitude. */
export type HeatTrackPoint = [number, number];
/** A continuous stretch of one activity. */
export type HeatTrackPart = HeatTrackPoint[];
/** One activity: its parts, in order. */
export type HeatTrack = HeatTrackPart[];

/** How far a simplified line may stray from the recorded fixes, in metres. */
export const HEATMAP_TRACK_TOLERANCE_M = 4;
/** Points one part keeps at most. */
export const HEATMAP_TRACK_PART_MAX_POINTS = 400;
/** Parts shorter than this are noise, not a street. */
const MIN_PART_LENGTH_M = 10;

export interface SimplifyHeatTrackOptions extends AddTrackOptions {
  /** Douglas-Peucker tolerance in metres. */
  toleranceM?: number;
  /** Most points a single part keeps. */
  maxPartPoints?: number;
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/**
 * Thins one activity to lines a map can draw: fixes with a poor accuracy are
 * dropped, the track is cut where it has a gap (same rules as the grid) and
 * each part is simplified, so a 1 Hz recording becomes a few hundred points.
 */
export function simplifyHeatTrack(
  fixes: readonly HeatFix[],
  options: SimplifyHeatTrackOptions = {}
): HeatTrackPart[] {
  const { toleranceM, maxPartPoints, ...gapOptions } = options;
  const opt = { ...DEFAULT_ADD, ...gapOptions };
  const tolerance = toleranceM ?? HEATMAP_TRACK_TOLERANCE_M;
  const maxPoints = Math.max(2, maxPartPoints ?? HEATMAP_TRACK_PART_MAX_POINTS);
  const parts: HeatTrackPart[] = [];
  let current: HeatFix[] = [];

  const flush = () => {
    if (current.length >= 2) {
      const points: RoutePoint[] = current.map((f) => ({
        lat: f.lat,
        lon: f.lon,
      }));
      const kept = simplifyRoute(points, maxPoints, tolerance).points;
      if (kept.length >= 2 && routeDistanceMeters(kept) >= MIN_PART_LENGTH_M) {
        parts.push(
          kept.map((p): HeatTrackPoint => [round5(p.lat), round5(p.lon)])
        );
      }
    }
    current = [];
  };

  let prev: HeatFix | null = null;
  for (const fix of fixes) {
    if (!validFix(fix, opt.maxAccuracyM)) continue;
    if (prev) {
      const seconds =
        prev.tMs !== undefined && fix.tMs !== undefined
          ? (fix.tMs - prev.tMs) / 1000
          : 0;
      if (
        approxMeters(prev, fix) > opt.maxGapM ||
        seconds > opt.maxGapSeconds
      ) {
        flush();
      }
    }
    current.push(fix);
    prev = fix;
  }
  flush();
  return parts;
}

/** The box around a part. */
export function heatPartBounds(part: readonly HeatTrackPoint[]): RouteBounds {
  const first = part[0] as HeatTrackPoint;
  const box: RouteBounds = {
    minLat: first[0],
    maxLat: first[0],
    minLon: first[1],
    maxLon: first[1],
  };
  for (const [lat, lon] of part) {
    if (lat < box.minLat) box.minLat = lat;
    if (lat > box.maxLat) box.maxLat = lat;
    if (lon < box.minLon) box.minLon = lon;
    if (lon > box.maxLon) box.maxLon = lon;
  }
  return box;
}

/** Whether two boxes share any area (or touch). */
export function boundsOverlap(a: RouteBounds, b: RouteBounds): boolean {
  return (
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat &&
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon
  );
}

function partPassesNear(
  part: readonly HeatTrackPoint[],
  project: (p: { lat: number; lon: number }) => { x: number; y: number },
  maxDistanceM: number
): boolean {
  const origin = { x: 0, y: 0 };
  const first = part[0];
  if (!first) return false;
  let prev = project({ lat: first[0], lon: first[1] });
  if (Math.hypot(prev.x, prev.y) <= maxDistanceM) return true;
  for (let i = 1; i < part.length; i++) {
    const p = part[i] as HeatTrackPoint;
    const cur = project({ lat: p[0], lon: p[1] });
    if (distanceToSegment(origin, prev, cur).distance <= maxDistanceM) {
      return true;
    }
    prev = cur;
  }
  return false;
}

/**
 * How many activities have a line within `maxDistanceM` of a position: an
 * activity counts once however many of its parts or passes are close.
 */
export function countTracksNear(
  tracks: readonly HeatTrack[],
  lat: number,
  lon: number,
  maxDistanceM: number
): number {
  const project = localProjector({ lat, lon });
  let count = 0;
  for (const track of tracks) {
    if (track.some((part) => partPassesNear(part, project, maxDistanceM))) {
      count++;
    }
  }
  return count;
}
