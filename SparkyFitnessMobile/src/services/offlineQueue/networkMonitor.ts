import * as Network from 'expo-network';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { addLog } from '../LogService';

/** No usable connection: the radio is off or the OS says nothing is reachable. */
export function isDeviceOffline(state: Network.NetworkState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * Keeps the store's `deviceOffline` flag current. `onRegained` runs when the
 * device goes from offline back to online. Returns a function that stops
 * listening.
 */
export function startNetworkMonitor(onRegained: () => void): () => void {
  const apply = (state: Network.NetworkState) => {
    const store = useOfflineQueueStore.getState();
    const offline = isDeviceOffline(state);
    const wasOffline = store.deviceOffline;
    store.setDeviceOffline(offline);
    if (wasOffline && !offline) onRegained();
  };

  let stopped = false;
  Network.getNetworkStateAsync()
    .then((state) => {
      if (!stopped) apply(state);
    })
    .catch((error: unknown) => {
      addLog(
        `[Offline Queue] Could not read the network state: ${error}`,
        'WARNING'
      );
    });
  const subscription = Network.addNetworkStateListener(apply);

  return () => {
    stopped = true;
    subscription.remove();
  };
}
