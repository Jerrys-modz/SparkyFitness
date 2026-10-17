import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import {
  buildPersistedCache,
  clearPersistedQueryCache,
  restoreQueryCache,
  selectQueriesToPersist,
  startQueryCachePersistence,
} from '../../src/services/queryCachePersistence';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const CACHE_KEY = '@SparkyFitness/queryCache';

function clientWith(
  entries: [readonly unknown[], unknown, number?][]
): QueryClient {
  const client = new QueryClient();
  for (const [key, data, updatedAt] of entries) {
    client.setQueryData(key, data, updatedAt ? { updatedAt } : undefined);
  }
  return client;
}

const roots = (queries: { queryKey: readonly unknown[] }[]) =>
  queries.map((q) => q.queryKey[0]);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useRealTimers();
});

describe('selectQueriesToPersist', () => {
  it('keeps only the whitelisted roots', () => {
    const client = clientWith([
      [['dailySummary', '2026-10-17'], {}],
      [['userPreferences'], {}],
      [['chatHistory'], {}],
      [['serverConnection'], true],
      [['exerciseHistory', 1], {}],
    ]);
    expect(
      roots(selectQueriesToPersist(client.getQueryCache().getAll())).sort()
    ).toEqual(['dailySummary', 'userPreferences']);
  });

  it('keeps the four newest days of a day-keyed root', () => {
    const client = clientWith(
      [1, 2, 3, 4, 5, 6].map(
        (day) =>
          [['dailySummary', `2026-10-0${day}`], { day }, day * 1000] as [
            readonly unknown[],
            unknown,
            number,
          ]
      )
    );
    const kept = selectQueriesToPersist(client.getQueryCache().getAll());
    expect(kept.map((q) => q.queryKey[1])).toEqual([
      '2026-10-06',
      '2026-10-05',
      '2026-10-04',
      '2026-10-03',
    ]);
  });

  it('skips a query that holds no data', () => {
    const client = new QueryClient();
    client.getQueryCache().build(client, { queryKey: ['userProfile'] });
    expect(selectQueriesToPersist(client.getQueryCache().getAll())).toEqual([]);
  });
});

describe('buildPersistedCache', () => {
  it('records the server configuration the data belongs to', () => {
    const client = clientWith([[['userPreferences'], { a: 1 }]]);
    const stored = JSON.parse(buildPersistedCache(client, 'config-1', 42));
    expect(stored).toMatchObject({ configId: 'config-1', savedAt: 42 });
    expect(stored.state.queries).toHaveLength(1);
  });

  it('drops the oldest days first to stay under the size budget', () => {
    const big = 'x'.repeat(700_000);
    const client = clientWith([
      [['dailySummary', '2026-10-01'], { big }, 1000],
      [['dailySummary', '2026-10-02'], { big }, 2000],
      [['dailySummary', '2026-10-03'], { big }, 3000],
    ]);
    const value = buildPersistedCache(client, 'config-1');
    expect(value.length).toBeLessThanOrEqual(1_500_000);
    const stored = JSON.parse(value);
    expect(
      stored.state.queries.map((q: { queryKey: unknown[] }) => q.queryKey[1])
    ).toEqual(['2026-10-03', '2026-10-02']);
  });
});

describe('restoreQueryCache', () => {
  it('restores the data and marks it stale so an online screen refetches', async () => {
    const source = clientWith([[['userPreferences'], { unit: 'kg' }]]);
    await AsyncStorage.setItem(
      CACHE_KEY,
      buildPersistedCache(source, 'config-1')
    );

    const target = new QueryClient();
    expect(await restoreQueryCache(target, 'config-1')).toBe(true);

    expect(target.getQueryData(['userPreferences'])).toEqual({ unit: 'kg' });
    expect(target.getQueryState(['userPreferences'])?.isInvalidated).toBe(true);
  });

  it('ignores a cache saved for another server', async () => {
    const source = clientWith([[['userPreferences'], { unit: 'kg' }]]);
    await AsyncStorage.setItem(
      CACHE_KEY,
      buildPersistedCache(source, 'config-1')
    );

    const target = new QueryClient();
    expect(await restoreQueryCache(target, 'config-2')).toBe(false);
    expect(target.getQueryData(['userPreferences'])).toBeUndefined();
  });

  it('survives unreadable data', async () => {
    await AsyncStorage.setItem(CACHE_KEY, '{nope');
    expect(await restoreQueryCache(new QueryClient(), 'config-1')).toBe(false);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ configId: 1 }));
    expect(await restoreQueryCache(new QueryClient(), 'config-1')).toBe(false);
  });

  it('does not overwrite data fetched since', async () => {
    const source = clientWith([[['userPreferences'], { unit: 'old' }, 1000]]);
    await AsyncStorage.setItem(
      CACHE_KEY,
      buildPersistedCache(source, 'config-1')
    );
    const target = clientWith([[['userPreferences'], { unit: 'fresh' }, 5000]]);

    await restoreQueryCache(target, 'config-1');

    expect(target.getQueryData(['userPreferences'])).toEqual({ unit: 'fresh' });
  });
});

describe('clearPersistedQueryCache', () => {
  it('removes the stored copy', async () => {
    await AsyncStorage.setItem(CACHE_KEY, 'x');
    await clearPersistedQueryCache();
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('startQueryCachePersistence', () => {
  it('saves shortly after the cache changes, once, and stops when asked', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const stop = startQueryCachePersistence(client, async () => 'config-1');

    client.setQueryData(['userPreferences'], { a: 1 });
    client.setQueryData(['userProfile'], { b: 2 });
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();

    await jest.advanceTimersByTimeAsync(3_100);
    const stored = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}');
    expect(stored.configId).toBe('config-1');
    expect(stored.state.queries).toHaveLength(2);

    stop();
    await AsyncStorage.removeItem(CACHE_KEY);
    client.setQueryData(['userPreferences'], { a: 2 });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('clears the stored copy when no server is configured', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(CACHE_KEY, 'stale');
    const client = new QueryClient();
    const stop = startQueryCachePersistence(client, async () => null);

    client.setQueryData(['userPreferences'], { a: 1 });
    await jest.advanceTimersByTimeAsync(3_100);

    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
    stop();
  });
});
