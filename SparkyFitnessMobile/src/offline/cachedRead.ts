import { getCacheRow, putCacheRows } from './cacheStore';
import { withOfflineFallback } from './withOfflineFallback';

/**
 * A server read the phone keeps a copy of under `collection` / `key` and
 * answers from when the server cannot be reached. For plain documents the
 * screen only reads; anything the person changes still goes to the server.
 */
export function cachedRead<T>(
  collection: string,
  key: string,
  fetch: () => Promise<T>
): Promise<T> {
  return withOfflineFallback<T>({
    fetch,
    store: (db, serverConfigId, value) =>
      putCacheRows(db, serverConfigId, collection, [{ key, payload: value }]),
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(db, serverConfigId, collection, key);
      return row ? (row.payload as T) : null;
    },
  });
}
