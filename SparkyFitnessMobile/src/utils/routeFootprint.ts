import {
  haversineMeters,
  simplifyRoute,
  type RoutePoint,
} from '@workspace/shared';

/*
 * Offline map for the watch: a "footprint" of known paths.
 *
 * Decision (see AGENTS.md, "An offline map on the watch"):
 *
 * The followed-route map is MapKit, which fetches tiles over the network, so a
 * phone-free run with no connection draws the route on a blank background.
 * Three ways to give it a basemap were weighed:
 *
 *  1. Map snapshots of the route area (MKMapSnapshotter) sent to the watch and
 *     drawn under the route. Rejected: the images are Apple Maps tiles, and
 *     Apple's Maps terms do not allow pre-fetching, caching or redistributing
 *     them for use without Apple Maps. It would also need a native module that
 *     cannot be compiled or tested here.
 *  2. Draw what the app already owns: the person's other saved routes that
 *     pass near this one, as thin grey lines, with the route on top. No
 *     third-party data, no network, works with a plain background, and it
 *     rotates with the heading-up camera because MapKit draws it as overlays.
 *     Chosen.
 *  3. A self-hosted tile or PMTiles source behind a setting. Not built: it
 *     needs a tile pipeline and settings UI for a feature that is off by
 *     default, far more than this change warrants.
 *
 * Tiles are never downloaded, from OpenStreetMap or anywhere else.
 */

/** Lines kept; the nearest, longest paths are the useful ones. */
export const FOOTPRINT_MAX_LINES = 12;
/** Points across all lines: about 6 KB on the wire, next to the ~20 KB route. */
export const FOOTPRINT_MAX_POINTS = 600;
/** One line is thinned to this many points before the overall cap applies. */
export const FOOTPRINT_MAX_LINE_POINTS = 120;
/** How far outside the route's bounding box a path still counts as nearby. */
export const FOOTPRINT_MARGIN_M = 800;
/** A path shorter than this inside the area is a fragment, not a landmark. */
export const FOOTPRINT_MIN_LINE_M = 80;
/** Other routes whose start is farther than this from ours are not fetched. */
export const FOOTPRINT_SEARCH_RADIUS_M = 15_000;
/** At most this many other routes are fetched, nearest start first. */
export const FOOTPRINT_MAX_ROUTES = 12;

/** Degrees go as whole millionths, like the route itself. */
const MICRO = 1_000_000;

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function paddedBounds(points: readonly RoutePoint[]): Bounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const latPad = FOOTPRINT_MARGIN_M / 111_320;
  const midLat = (minLat + maxLat) / 2;
  const lonPad =
    FOOTPRINT_MARGIN_M /
    (111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
  };
}

function inside(p: RoutePoint, b: Bounds): boolean {
  return (
    p.lat >= b.minLat &&
    p.lat <= b.maxLat &&
    p.lon >= b.minLon &&
    p.lon <= b.maxLon
  );
}

function lengthMeters(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** The stretches of `points` that lie inside `bounds`, each at least two points. */
function runsInside(
  points: readonly RoutePoint[],
  bounds: Bounds
): RoutePoint[][] {
  const runs: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  for (const p of points) {
    if (inside(p, bounds)) {
      current.push(p);
    } else {
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

/**
 * Other saved routes worth fetching for `route`'s footprint: those whose start
 * is within the search radius of its first point, nearest first, capped.
 */
export function nearbyRouteIds(
  route: { id: string; points: readonly RoutePoint[] },
  others: readonly { id: string; start: RoutePoint | null }[]
): string[] {
  const origin = route.points[0];
  if (!origin) return [];
  return others
    .filter((other) => other.id !== route.id && other.start)
    .map((other) => ({
      id: other.id,
      distance: haversineMeters(origin, other.start as RoutePoint),
    }))
    .filter((other) => other.distance <= FOOTPRINT_SEARCH_RADIUS_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, FOOTPRINT_MAX_ROUTES)
    .map((other) => other.id);
}

/**
 * The footprint for `route`: the parts of `others` (the person's own other
 * routes) that lie near it, as flat `[lat, lon, …]` lines in millionths of a
 * degree, the longest first. Each line is thinned and the whole is capped at
 * `FOOTPRINT_MAX_LINES` lines and `FOOTPRINT_MAX_POINTS` points, so the
 * payload stays a few kilobytes. Empty when nothing else is nearby.
 */
export function buildRouteFootprint(
  route: { points: readonly RoutePoint[] },
  others: readonly { points: readonly RoutePoint[] }[]
): number[][] {
  if (route.points.length < 2) return [];
  const bounds = paddedBounds(route.points);

  const lines: { points: RoutePoint[]; length: number }[] = [];
  for (const other of others) {
    for (const run of runsInside(other.points, bounds)) {
      const length = lengthMeters(run);
      if (length < FOOTPRINT_MIN_LINE_M) continue;
      const points =
        run.length > FOOTPRINT_MAX_LINE_POINTS
          ? simplifyRoute(run, FOOTPRINT_MAX_LINE_POINTS, 4).points
          : run;
      lines.push({ points, length });
    }
  }
  lines.sort((a, b) => b.length - a.length);

  const kept: RoutePoint[][] = [];
  let total = 0;
  for (const line of lines) {
    if (kept.length >= FOOTPRINT_MAX_LINES) break;
    if (total + line.points.length > FOOTPRINT_MAX_POINTS) continue;
    kept.push(line.points);
    total += line.points.length;
  }

  return kept.map((points) =>
    points.flatMap((p) => [
      Math.round(p.lat * MICRO),
      Math.round(p.lon * MICRO),
    ])
  );
}
