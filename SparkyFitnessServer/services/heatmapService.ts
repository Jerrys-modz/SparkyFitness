import {
  HEATMAP_BASE_CELL_M,
  addTrackToHeatGrid,
  heatGridBounds,
  sliceHeatGrid,
  trackActivityKind,
  type HeatGrid,
  type HeatmapQuery,
  type HeatmapResponse,
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
}

const ALL_KINDS = ['run', 'walk', 'ride', 'hike'] as const;

interface HeatFilter {
  kinds: readonly (typeof ALL_KINDS)[number][];
  includeUnknown: boolean;
  from: string | null;
  to: string | null;
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
  const kinds = query.activities ?? [...ALL_KINDS];
  const includeUnknown = query.activities === undefined;
  const from = query.from ?? null;
  const to = query.to ?? null;
  const key = `${userId}|${[...kinds].sort().join(',')}|${includeUnknown}|${from}|${to}`;

  const filter: HeatFilter = { kinds, includeUnknown, from, to };
  const stamp = await getHeatStamp(userId, from, to, authenticatedUserId);
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
