import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';
import { AppState } from 'react-native';
import { addLog } from './LogService';

/**
 * A small, bounded copy of the read cache, so the diary, dashboard and food
 * lists can still be shown when the server is out of reach. It is not a
 * general query persister: only the roots below are kept, a few days at most,
 * and the whole value is held under a size budget (a single AsyncStorage row
 * over a couple of MB cannot be read back on Android).
 */
const CACHE_KEY = '@SparkyFitness/queryCache';
const SAVE_DELAY_MS = 3_000;
const MAX_BYTES = 1_500_000;

/** Root key -> how many entries of that root are kept (newest first). */
const PERSISTED_ROOTS: Readonly<Record<string, number>> = {
  dailySummary: 4,
  measurements: 4,
  foodVariants: 30,
  userPreferences: 1,
  userProfile: 1,
  waterContainers: 1,
  mealTypes: 1,
  foods: 1,
  favorites: 1,
  customNutrients: 1,
  nutrientDisplayPreferences: 1,
};

interface PersistedCache {
  configId: string;
  savedAt: number;
  state: DehydratedState;
}

function rootOf(query: Query): string | null {
  const root = query.queryKey[0];
  return typeof root === 'string' ? root : null;
}

/** The queries worth keeping: whitelisted roots, newest first, within the caps. */
export function selectQueriesToPersist(queries: readonly Query[]): Query[] {
  const kept: Record<string, number> = {};
  return [...queries]
    .filter((query) => {
      const root = rootOf(query);
      return (
        root !== null &&
        root in PERSISTED_ROOTS &&
        query.state.status === 'success' &&
        query.state.data !== undefined
      );
    })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .filter((query) => {
      const root = rootOf(query) as string;
      kept[root] = (kept[root] ?? 0) + 1;
      return kept[root] <= PERSISTED_ROOTS[root];
    });
}

/** Builds the value to store, dropping the oldest queries until it fits. */
export function buildPersistedCache(
  queryClient: QueryClient,
  configId: string,
  now = Date.now()
): string {
  const chosen = new Set(
    selectQueriesToPersist(queryClient.getQueryCache().getAll())
  );
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => chosen.has(query),
  });
  // `dehydrate` keeps the cache's own order; newest data first makes trimming
  // from the end drop the oldest.
  state.queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  let value = JSON.stringify({ configId, savedAt: now, state });
  while (value.length > MAX_BYTES && state.queries.length > 0) {
    state.queries.pop();
    value = JSON.stringify({ configId, savedAt: now, state });
  }
  return value;
}

function isPersistedCache(value: unknown): value is PersistedCache {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PersistedCache>;
  return (
    typeof candidate.configId === 'string' &&
    typeof candidate.savedAt === 'number' &&
    typeof candidate.state === 'object' &&
    candidate.state !== null &&
    Array.isArray(candidate.state.queries)
  );
}

/**
 * Loads the stored cache into the client, only if it belongs to `configId`.
 * Restored queries are marked stale, so a screen opened with a connection
 * refetches instead of trusting yesterday's numbers; offline, the stale data
 * is simply what is shown.
 */
export async function restoreQueryCache(
  queryClient: QueryClient,
  configId: string
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedCache(parsed) || parsed.configId !== configId) {
      return false;
    }
    hydrate(queryClient, parsed.state);
    for (const dehydrated of parsed.state.queries) {
      void queryClient.invalidateQueries({
        queryKey: dehydrated.queryKey,
        exact: true,
        refetchType: 'none',
      });
    }
    return true;
  } catch (error) {
    addLog(
      `[Offline Queue] Could not restore the cached data: ${error}`,
      'WARNING'
    );
    return false;
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    addLog(
      `[Offline Queue] Could not clear the cached data: ${error}`,
      'WARNING'
    );
  }
}

/**
 * Saves the cache shortly after it changes, and when the app leaves the
 * foreground. Call after `restoreQueryCache`, never before, or the stored copy
 * would be overwritten by an empty cache. Returns a function that stops it.
 */
export function startQueryCachePersistence(
  queryClient: QueryClient,
  getConfigId: () => Promise<string | null>
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = async () => {
    timer = null;
    try {
      const configId = await getConfigId();
      if (!configId) {
        await clearPersistedQueryCache();
        return;
      }
      await AsyncStorage.setItem(
        CACHE_KEY,
        buildPersistedCache(queryClient, configId)
      );
    } catch (error) {
      addLog(
        `[Offline Queue] Could not save the cached data: ${error}`,
        'WARNING'
      );
    }
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(schedule);
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') return;
    if (timer !== null) clearTimeout(timer);
    void save();
  });

  return () => {
    unsubscribe();
    appState.remove();
    if (timer !== null) clearTimeout(timer);
  };
}
