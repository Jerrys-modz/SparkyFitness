import { useEffect } from 'react';
import WatchConnectivity from '../../modules/watch-connectivity';
import { useWatchRouteStore } from '../stores/watchRouteStore';

/**
 * Takes in the watch's report of its route library (`routeLibrary`): what it
 * holds and which routes it turned away. Mounted headlessly with the other
 * watch bridges. The watch reports after every change and whenever its
 * session activates, so a queued report is picked up on the next launch.
 */
export function useWatchRouteBridge(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const subscription = WatchConnectivity.addListener(
      'onRouteLibrary',
      (report) => useWatchRouteStore.getState().applyReport(report)
    );
    return () => subscription.remove();
  }, [enabled]);
}
