import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { clearPersistedQueryCache } from '../queryCachePersistence';
import { getActiveServerConfig } from '../storage';
import { dismissAttention, removeItem } from './queueLogic';
import { drainQueue } from './queueRunner';

/**
 * The signed-in account or active server just changed (a re-login, a switch).
 * The cached read data belongs to whoever was signed in before and goes. The
 * queue stays: after a plain re-login its items are still the person's, and
 * the drain checks the account before sending a thing.
 */
export async function onOfflineQueueIdentityChanged(): Promise<void> {
  await clearPersistedQueryCache();
  const config = await getActiveServerConfig();
  useOfflineQueueStore.getState().setActiveConfigId(config?.id ?? null);
  void drainQueue();
}

/** A deleted server configuration can never receive what was queued for it. */
export async function purgeOfflineQueueForConfig(
  configId: string
): Promise<void> {
  await useOfflineQueueStore.getState().commit((state) => {
    const { [configId]: _removed, ...accounts } = state.accounts;
    return {
      items: state.items.filter((item) => item.configId !== configId),
      attention: state.attention.filter((item) => item.configId !== configId),
      accounts,
    };
  });
}

/**
 * Removes an entry that is still waiting to be sent. It never reached the
 * server, so there is nothing else to undo.
 */
export async function cancelQueuedItem(queueId: string): Promise<void> {
  await useOfflineQueueStore
    .getState()
    .commit((state) => removeItem(state, queueId));
}

/** Drops an entry from the needs-attention list. */
export async function discardAttentionItem(queueId: string): Promise<void> {
  await useOfflineQueueStore
    .getState()
    .commit((state) => dismissAttention(state, queueId));
}
