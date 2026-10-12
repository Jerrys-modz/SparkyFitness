import { useEffect, useRef } from 'react';
import WatchConnectivity, {
  type WatchRunFinishedPayload,
} from '../../modules/watch-connectivity';
import { queryClient } from './queryClient';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { usePreferences } from './usePreferences';
import { addLog } from '../services/LogService';
import {
  enqueueWatchRun,
  processWatchRunQueue,
} from '../services/watchRunQueue';
import { parseWatchRunPayload } from '../utils/watchRun';

/**
 * Files walks and runs the watch recorded on its own. The watch sends each one
 * when it finishes (queued, so a phone out of range gets it later); it lands
 * in a stored queue first and is then saved to the diary, retrying whenever
 * the server is reachable. Mounted headlessly, like the other watch bridges.
 */
export function useWatchRunBridge(
  enabled: boolean,
  isServerConnected: boolean
): void {
  const { preferences } = usePreferences();
  const unit: 'km' | 'miles' =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';
  const unitRef = useRef(unit);
  const connectedRef = useRef(isServerConnected);
  useEffect(() => {
    unitRef.current = unit;
    connectedRef.current = isServerConnected;
  }, [unit, isServerConnected]);

  const drain = useRef(async () => {
    if (!connectedRef.current) return;
    const days = await processWatchRunQueue(unitRef.current);
    for (const day of new Set(days)) invalidateExerciseCache(queryClient, day);
  });

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const sub = WatchConnectivity.addListener(
      'onRunFinished',
      (raw: WatchRunFinishedPayload) => {
        const payload = parseWatchRunPayload(raw);
        if (!payload) {
          addLog(
            '[Watch Run] Ignored an unreadable run from the watch',
            'WARNING'
          );
          return;
        }
        void enqueueWatchRun(payload)
          .then(() => drain.current())
          .catch((error: unknown) =>
            addLog(
              `[Watch Run] Could not store watch run: ${error instanceof Error ? error.message : String(error)}`,
              'ERROR'
            )
          );
      }
    );
    return () => sub.remove();
  }, [enabled]);

  // Anything left from an earlier launch or an offline stretch.
  useEffect(() => {
    if (!enabled || !isServerConnected) return;
    void drain.current().catch(() => undefined);
  }, [enabled, isServerConnected]);
}
