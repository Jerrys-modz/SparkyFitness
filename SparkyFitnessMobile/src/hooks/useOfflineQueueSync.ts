import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { addLog } from '../services/LogService';
import { startNetworkMonitor } from '../services/offlineQueue/networkMonitor';
import { drainQueue } from '../services/offlineQueue/queueRunner';
import {
  restoreQueryCache,
  startQueryCachePersistence,
} from '../services/queryCachePersistence';
import { getActiveServerConfig } from '../services/storage';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { serverConnectionQueryKey } from './queryKeys';

/** How often waiting entries are retried while the app is open. */
const RETRY_INTERVAL_MS = 60_000;

/**
 * Mounted once in the app shell. Loads the persisted queue and read cache,
 * then keeps the queue draining: when the app returns to the foreground, when
 * the device or the server comes back, and on a slow timer for entries that
 * are backing off.
 */
export function useOfflineQueueSync(): void {
  const queryClient = useQueryClient();
  const hasPending = useOfflineQueueStore((s) => s.items.length > 0);

  useEffect(() => {
    let cancelled = false;
    let stopPersistence: (() => void) | null = null;

    void (async () => {
      try {
        const config = await getActiveServerConfig();
        await useOfflineQueueStore.getState().hydrate(config?.id ?? null);
        if (config) await restoreQueryCache(queryClient, config.id);
        if (cancelled) return;
        stopPersistence = startQueryCachePersistence(
          queryClient,
          async () => (await getActiveServerConfig())?.id ?? null
        );
        void drainQueue();
      } catch (error) {
        addLog(`[Offline Queue] Startup failed: ${error}`, 'ERROR');
      }
    })();

    const stopNetwork = startNetworkMonitor(() => void drainQueue());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });

    return () => {
      cancelled = true;
      stopPersistence?.();
      stopNetwork();
      appState.remove();
    };
  }, [queryClient]);

  // The server answering again is the moment queued entries can go. This reads
  // the connection check from the query cache rather than through
  // `useServerConnection`, whose focus refetch needs a navigation context that
  // the app shell sits outside of.
  const serverReachable = useRef<boolean | null>(null);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] !== serverConnectionQueryKey[0]) return;
        const reachable = event.query.state.data === true;
        const regained = reachable && serverReachable.current !== true;
        serverReachable.current = reachable;
        if (regained) void drainQueue();
      }),
    [queryClient]
  );

  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setInterval(() => void drainQueue(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending]);
}
