import { useMemo } from 'react';
import { itemsForConfig } from '../services/offlineQueue/queueLogic';
import type { QueueItem } from '../services/offlineQueue/types';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';

/**
 * Queued writes for the active server, plus the ones just sent whose refetch
 * has not landed yet. Screens lay these over the cached server data so what
 * the person logged is visible at once. The array identity only changes when
 * its contents do, so it is safe in a `select` dependency list.
 */
export function useOverlayItems(): QueueItem[] {
  const items = useOfflineQueueStore((s) => s.items);
  const settling = useOfflineQueueStore((s) => s.settling);
  const configId = useOfflineQueueStore((s) => s.activeConfigId);
  return useMemo(
    () => [
      ...itemsForConfig(items, configId),
      ...settling.filter((item) => item.configId === configId),
    ],
    [items, settling, configId]
  );
}
