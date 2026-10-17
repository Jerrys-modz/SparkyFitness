import { useMemo } from 'react';
import { itemsForConfig } from '../services/offlineQueue/queueLogic';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { useServerConnection } from './useServerConnection';

export interface OfflineQueueStatus {
  pendingCount: number;
  attentionCount: number;
  /** The device reports no connection, or the server has not answered. */
  isOffline: boolean;
  isSyncing: boolean;
}

/** What the banner and the queue screen need to know about the queue. */
export function useOfflineQueueStatus(): OfflineQueueStatus {
  const items = useOfflineQueueStore((s) => s.items);
  const attention = useOfflineQueueStore((s) => s.attention);
  const configId = useOfflineQueueStore((s) => s.activeConfigId);
  const deviceOffline = useOfflineQueueStore((s) => s.deviceOffline);
  const draining = useOfflineQueueStore((s) => s.draining);
  const { isConnected, isLoading } = useServerConnection();

  return useMemo(
    () => ({
      pendingCount: itemsForConfig(items, configId).length,
      attentionCount: attention.filter((item) => item.configId === configId)
        .length,
      // Without a configured server there is nothing to be offline from.
      isOffline:
        deviceOffline || (configId !== null && !isLoading && !isConnected),
      isSyncing: draining,
    }),
    [
      items,
      attention,
      configId,
      deviceOffline,
      draining,
      isConnected,
      isLoading,
    ]
  );
}
