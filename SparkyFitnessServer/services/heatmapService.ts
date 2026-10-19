import {
  HEATMAP_BASE_CELL_M,
  HEATMAP_TRACK_TOLERANCE_M,
  addTrackToHeatGrid,
  boundsOverlap,
  heatGridBounds,
  heatPartBounds,
  simplifyHeatTrack,
  sliceHeatGrid,
  trackActivityKind,
  type HeatGrid,
  type HeatmapQuery,
  type HeatmapResponse,
  type HeatmapTracksQuery,
  type HeatmapTracksResponse,
  type HeatTrack,
  type HeatTrackPart,
  type RouteBounds,
} from '@workspace/shared';
import {
  countHeatRowsAfter,
  getHeatStamp,
  getTrackBatch,
  listHeatEntries,
  type HeatEntry,
  type HeatStamp,
} from '../models/heatmapRepository.js';

/** Tracks read from the database per round trip: bounds peak memory. */
export const HEAT_TRACK_BATCH = 8;
/** Cells one person's cached grid may hold; the oldest activities are skipped past it. */
export const HEAT_MAX_GRID_CELLS = 400_000;
/** Cached grids kept across all people. */
const CACHE_MAX_ENTRIES = 24;

interface CachedGrid {
  stamp: HeatStamp;
  grid: HeatGrid;
  activityCount: number;
  firstDate: string | null;
  lastDate: string | null;
  capped: boolean;
}

const cache = new Map<string, CachedGrid>();
const building = new Map<string, Promise<CachedGrid>>();

export function clearHeatmapCache(): void {
  cache.clear();
  building.clear();
  trackCache.clear();
  trackBuilding.clear();
}

const ALL_KINDS = ['run', 'walk', 'ride', 'hike'] as const;

interface HeatFilter {
  kinds: readonly (typeof ALL_KINDS)[number][];
  includeUnknown: boolean;
  from: string | null;
  to: string | null;
}

/** The filter a query asks for and a key that is the same for the same filter. */
function filterOf(
  userId: string,
  query: Pick<HeatmapQuery, 'activities' | 'from' | 'to'>
): { filter: HeatFilter; key: string } {
  const kinds = query.activities ?? [...ALL_KINDS];
  const includeUnknown = query.activities === undefined;
  const from = query.from ?? null;
  const to = query.to ?? null;
  return {
    filter: { kinds, includeUnknown, from, to },
    key: `${userId}|${[...kinds].sort().join(',')}|${includeUnknown}|${from}|${to}`,
  };
}

function wantedEntries(entries: HeatEntry[], filter: HeatFilter): HeatEntry[] {
  return entries.filter((entry) => {
    const kind = trackActivityKind({
      exerciseName: entry.exerciseName,
      category: entry.category,
      notes: entry.notes,
    });
    if (kind === 'excluded') return false;
    if (kind === 'unknown') return filter.includeUnknown;
    return filter.kinds.includes(kind);
  });
}

/** Streams `wanted` into `state.grid` a few tracks at a time. */
async function addEntries(
  userId: string,
  wanted: HeatEntry[],
  state: CachedGrid,
  authenticatedUserId?: string
): Promise<void> {
  for (let i = 0; i < wanted.length && !state.capped; i += HEAT_TRACK_BATCH) {
    const batch = wanted.slice(i, i + HEAT_TRACK_BATCH);
    const tracks = await getTrackBatch(
      userId,
      batch.map((e) => e.entryId),
      authenticatedUserId
    );
    for (const entry of batch) {
      const fixes = tracks.get(entry.entryId);
      if (!fixes || fixes.length < 2) continue;
      if (state.grid.size >= HEAT_MAX_GRID_CELLS) {
        state.capped = true;
        break;
      }
      if (addTrackToHeatGrid(state.grid, fixes) === 0) continue;
      state.activityCount++;
      if (state.lastDate === null || entry.entryDate > state.lastDate) {
        state.lastDate = entry.entryDate;
      }
      if (state.firstDate === null || entry.entryDate < state.firstDate) {
        state.firstDate = entry.entryDate;
      }
    }
  }
}

async function buildGrid(
  userId: string,
  filter: HeatFilter,
  stamp: HeatStamp,
  authenticatedUserId?: string
): Promise<CachedGrid> {
  const entries = await listHeatEntries(
    userId,
    filter.from,
    filter.to,
    authenticatedUserId
  );
  const state: CachedGrid = {
    stamp,
    grid: new Map(),
    activityCount: 0,
    firstDate: null,
    lastDate: null,
    capped: false,
  };
  await addEntries(
    userId,
    wantedEntries(entries, filter),
    state,
    authenticatedUserId
  );
  return state;
}

/**
 * Brings a cached grid up to date when the only change is new activities:
 * the count grew by exactly the number of tracks changed since the cache was
 * built, so none was replaced or removed. Null when it must be rebuilt.
 */
async function extendGrid(
  userId: string,
  filter: HeatFilter,
  cached: CachedGrid,
  stamp: HeatStamp,
  authenticatedUserId?: string
): Promise<CachedGrid | null> {
  if (cached.stamp.last === null || cached.capped) return null;
  const newer = await countHeatRowsAfter(
    userId,
    filter.from,
    filter.to,
    cached.stamp.last,
    authenticatedUserId
  );
  if (newer === 0 || stamp.count - cached.stamp.count !== newer) return null;
  const fresh = await listHeatEntries(
    userId,
    filter.from,
    filter.to,
    authenticatedUserId,
    cached.stamp.last
  );
  if (fresh.length !== newer) return null;
  const next: CachedGrid = { ...cached, grid: new Map(cached.grid), stamp };
  await addEntries(
    userId,
    wantedEntries(fresh, filter),
    next,
    authenticatedUserId
  );
  return next;
}

/**
 * The person's heatmap for a view. The per-person grid (every cell at the
 * finest size, for the chosen kinds and dates) is built by streaming their
 * stored tracks a few at a time, then cached until the tracks change; the
 * view is cut and coarsened from the cache, so panning and zooming are cheap.
 */
export async function getHeatmap(
  userId: string,
  query: HeatmapQuery,
  authenticatedUserId?: string
): Promise<HeatmapResponse> {
  const { filter, key } = filterOf(userId, query);
  const stamp = await getHeatStamp(
    userId,
    filter.from,
    filter.to,
    authenticatedUserId
  );
  const stampKey = `${stamp.count}:${stamp.last}`;
  let entry = cache.get(key);
  if (!entry || `${entry.stamp.count}:${entry.stamp.last}` !== stampKey) {
    const previous = entry;
    let pending = building.get(`${key}|${stampKey}`);
    if (!pending) {
      pending = (async () => {
        const extended = previous
          ? await extendGrid(
              userId,
              filter,
              previous,
              stamp,
              authenticatedUserId
            )
          : null;
        return (
          extended ??
          (await buildGrid(userId, filter, stamp, authenticatedUserId))
        );
      })().finally(() => building.delete(`${key}|${stampKey}`));
      building.set(`${key}|${stampKey}`, pending);
    }
    entry = await pending;
    if (cache.size >= CACHE_MAX_ENTRIES && !cache.has(key)) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.delete(key);
    cache.set(key, entry);
  }

  const hasView =
    query.minLat !== undefined &&
    query.maxLat !== undefined &&
    query.minLon !== undefined &&
    query.maxLon !== undefined;
  const slice = sliceHeatGrid(
    entry.grid,
    HEATMAP_BASE_CELL_M,
    hasView
      ? {
          minLat: query.minLat as number,
          maxLat: query.maxLat as number,
          minLon: query.minLon as number,
          maxLon: query.maxLon as number,
        }
      : null,
    query.maxCells
  );
  return {
    cellM: slice.cellM,
    cells: slice.cells.map((c) => [
      Math.round(c.lat * 1e5) / 1e5,
      Math.round(c.lon * 1e5) / 1e5,
      c.count,
    ]),
    maxCount: slice.maxCount,
    activityCount: entry.activityCount,
    truncated: slice.truncated || entry.capped,
    bounds: heatGridBounds(entry.grid, HEATMAP_BASE_CELL_M),
    firstDate: entry.firstDate,
    lastDate: entry.lastDate,
  };
}

/** Points the cached lines of one person may hold; the oldest activities are skipped past it. */
export const HEAT_MAX_CACHED_TRACK_POINTS = 600_000;
/** Cached line sets kept across all people. */
const TRACK_CACHE_MAX_ENTRIES = 8;

interface CachedTrack {
  parts: HeatTrackPart[];
  box: RouteBounds;
  partBoxes: RouteBounds[];
}

interface CachedTracks {
  stamp: HeatStamp;
  /** Newest activity first. */
  tracks: CachedTrack[];
  /** True when the oldest activities were left out of the cache. */
  capped: boolean;
}

const trackCache = new Map<string, CachedTracks>();
const trackBuilding = new Map<string, Promise<CachedTracks>>();

async function buildTracks(
  userId: string,
  filter: HeatFilter,
  stamp: HeatStamp,
  authenticatedUserId?: string
): Promise<CachedTracks> {
  const entries = wantedEntries(
    await listHeatEntries(userId, filter.from, filter.to, authenticatedUserId),
    filter
  );
  const state: CachedTracks = { stamp, tracks: [], capped: false };
  let points = 0;
  for (let i = 0; i < entries.length && !state.capped; i += HEAT_TRACK_BATCH) {
    const batch = entries.slice(i, i + HEAT_TRACK_BATCH);
    const fixes = await getTrackBatch(
      userId,
      batch.map((e) => e.entryId),
      authenticatedUserId
    );
    for (const entry of batch) {
      const parts = simplifyHeatTrack(fixes.get(entry.entryId) ?? []);
      if (parts.length === 0) continue;
      const count = parts.reduce((n, part) => n + part.length, 0);
      if (points + count > HEAT_MAX_CACHED_TRACK_POINTS) {
        state.capped = true;
        break;
      }
      points += count;
      const partBoxes = parts.map(heatPartBounds);
      state.tracks.push({
        parts,
        partBoxes,
        box: partBoxes.reduce((all, b) => ({
          minLat: Math.min(all.minLat, b.minLat),
          maxLat: Math.max(all.maxLat, b.maxLat),
          minLon: Math.min(all.minLon, b.minLon),
          maxLon: Math.max(all.maxLon, b.maxLon),
        })),
      });
    }
  }
  return state;
}

/**
 * The person's own simplified tracks that pass through a map box, for a map
 * to draw as lines. Every stored track (for the chosen kinds and dates) is
 * simplified once and cached until their tracks change, like the grid; a
 * request only cuts the box out of the cache. Newest activities come first,
 * and when more than `maxTracks` / `maxPoints` fit, the rest is left out and
 * `truncated` is set, so the caller can fall back to the grid.
 */
export async function getHeatmapTracks(
  userId: string,
  query: HeatmapTracksQuery,
  authenticatedUserId?: string
): Promise<HeatmapTracksResponse> {
  const { filter, key } = filterOf(userId, query);
  const stamp = await getHeatStamp(
    userId,
    filter.from,
    filter.to,
    authenticatedUserId
  );
  const stampKey = `${stamp.count}:${stamp.last}`;
  let entry = trackCache.get(key);
  if (!entry || `${entry.stamp.count}:${entry.stamp.last}` !== stampKey) {
    const buildKey = `${key}|${stampKey}`;
    let pending = trackBuilding.get(buildKey);
    if (!pending) {
      pending = buildTracks(userId, filter, stamp, authenticatedUserId).finally(
        () => trackBuilding.delete(buildKey)
      );
      trackBuilding.set(buildKey, pending);
    }
    entry = await pending;
    if (trackCache.size >= TRACK_CACHE_MAX_ENTRIES && !trackCache.has(key)) {
      const oldest = trackCache.keys().next().value;
      if (oldest !== undefined) trackCache.delete(oldest);
    }
    trackCache.delete(key);
    trackCache.set(key, entry);
  }

  const view: RouteBounds = {
    minLat: query.minLat,
    maxLat: query.maxLat,
    minLon: query.minLon,
    maxLon: query.maxLon,
  };
  const tracks: HeatTrack[] = [];
  let pointCount = 0;
  let truncated = entry.capped;
  for (const cached of entry.tracks) {
    if (!boundsOverlap(cached.box, view)) continue;
    const parts = cached.parts.filter((_, i) =>
      boundsOverlap(cached.partBoxes[i] as RouteBounds, view)
    );
    if (parts.length === 0) continue;
    const count = parts.reduce((n, part) => n + part.length, 0);
    if (
      tracks.length >= query.maxTracks ||
      pointCount + count > query.maxPoints
    ) {
      truncated = true;
      break;
    }
    tracks.push(parts);
    pointCount += count;
  }
  return {
    tracks,
    pointCount,
    truncated,
    toleranceM: HEATMAP_TRACK_TOLERANCE_M,
  };
}
