import { addDays, nearestHeatCell, type HeatCell } from '@workspace/shared';
import type { HeatmapParams } from '../services/api/heatmapApi';
import { routeRegion } from './cardioSession';

export const HEATMAP_PERIODS = ['30d', '90d', '1y', 'all'] as const;
export type HeatmapPeriod = (typeof HEATMAP_PERIODS)[number];

export const HEATMAP_ACTIVITIES = [
  'all',
  'run',
  'walk',
  'ride',
  'hike',
] as const;
export type HeatmapActivity = (typeof HEATMAP_ACTIVITIES)[number];

/** Cells asked for per view: a native map draws each as an overlay. */
export const HEATMAP_MAX_CELLS = 900;

/** First day of a period ending `today`, or undefined for all time. */
export function heatmapPeriodFrom(
  period: HeatmapPeriod,
  today: string
): string | undefined {
  switch (period) {
    case '30d':
      return addDays(today, -29);
    case '90d':
      return addDays(today, -89);
    case '1y':
      return addDays(today, -364);
    default:
      return undefined;
  }
}

export interface MapRegionLike {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Rounded to about 100 m so a tiny pan does not fetch again. */
const VIEW_DECIMALS = 3;

/**
 * The viewport as the four corners the API takes, padded by a third on every
 * side so a small pan stays inside what was fetched, and rounded.
 */
export function viewFromRegion(
  region: MapRegionLike
): NonNullable<HeatmapParams['view']> {
  const latPad = region.latitudeDelta / 3;
  const lonPad = region.longitudeDelta / 3;
  const round = (n: number, dir: 'down' | 'up') => {
    const f = 10 ** VIEW_DECIMALS;
    return (dir === 'down' ? Math.floor(n * f) : Math.ceil(n * f)) / f;
  };
  return {
    minLat: Math.max(
      -90,
      round(region.latitude - region.latitudeDelta / 2 - latPad, 'down')
    ),
    maxLat: Math.min(
      90,
      round(region.latitude + region.latitudeDelta / 2 + latPad, 'up')
    ),
    minLon: Math.max(
      -180,
      round(region.longitude - region.longitudeDelta / 2 - lonPad, 'down')
    ),
    maxLon: Math.min(
      180,
      round(region.longitude + region.longitudeDelta / 2 + lonPad, 'up')
    ),
  };
}

/** Whether the current view is still inside what was last fetched. */
export function viewInside(
  inner: MapRegionLike,
  outer: NonNullable<HeatmapParams['view']> | undefined
): boolean {
  if (!outer) return false;
  return (
    inner.latitude - inner.latitudeDelta / 2 >= outer.minLat &&
    inner.latitude + inner.latitudeDelta / 2 <= outer.maxLat &&
    inner.longitude - inner.longitudeDelta / 2 >= outer.minLon &&
    inner.longitude + inner.longitudeDelta / 2 <= outer.maxLon
  );
}

/** The value below which `share` of the total weight of `pairs` (value, weight) falls. */
function weightedQuantile(
  pairs: readonly (readonly [number, number])[],
  share: number
): number {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, [, weight]) => sum + weight, 0);
  let seen = 0;
  for (const [value, weight] of sorted) {
    seen += weight;
    if (seen >= total * share) return value;
  }
  return sorted[sorted.length - 1]?.[0] ?? 0;
}

/** Share of the heat left out of each end when framing, so one far trip does not set the zoom. */
const FRAME_TRIM = 0.03;

/**
 * A map region framing where the heat is: the box holding all but the faintest
 * few percent at either end, weighted by how often each cell was used. A single
 * trip to another city leaves the home area filling the map, not a whole country.
 */
export function regionForCells(
  cells: readonly (readonly [number, number, number])[]
): MapRegionLike | null {
  if (cells.length === 0) return null;
  const lats = cells.map(([lat, , count]) => [lat, count] as const);
  const lons = cells.map(([, lon, count]) => [lon, count] as const);
  return routeRegion(
    [
      {
        lat: weightedQuantile(lats, FRAME_TRIM),
        lon: weightedQuantile(lons, FRAME_TRIM),
      },
      {
        lat: weightedQuantile(lats, 1 - FRAME_TRIM),
        lon: weightedQuantile(lons, 1 - FRAME_TRIM),
      },
    ],
    1.5
  );
}

/** Fill colours, faint to strong, for count classes 0 to 4. */
export const HEATMAP_COLORS = [
  'rgba(255, 190, 70, 0.35)',
  'rgba(255, 150, 40, 0.5)',
  'rgba(255, 105, 20, 0.62)',
  'rgba(240, 60, 20, 0.75)',
  'rgba(220, 20, 60, 0.88)',
] as const;

export const HEATMAP_CLASSES = HEATMAP_COLORS.length;

/** Circle radius that makes neighbouring cells meet. */
export function heatCellRadiusM(cellM: number): number {
  return cellM * 0.62;
}

/** The cell under a tap, if one is close enough to be meant. */
export function cellAtTap(
  cells: readonly HeatCell[],
  cellM: number,
  lat: number,
  lon: number
): HeatCell | null {
  return nearestHeatCell(cells, lat, lon, cellM * 1.1);
}
