import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity, {
  type WatchRunFinishedPayload,
  type WatchRunLivePayload,
} from '../../modules/watch-connectivity';
import {
  useWatchRunLiveStore,
  WATCH_RUN_LIVE_MAX_AGE_MS,
} from '../stores/watchRunLiveStore';
import { queryClient } from './queryClient';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { usePreferences } from './usePreferences';
import { addLog } from '../services/LogService';
import {
  enqueueWatchRun,
  hasQueuedWatchRuns,
  processWatchRunQueue,
} from '../services/watchRunQueue';
import { announceWatchRun } from '../services/watchRunToast';
import { parseWatchRunPayload } from '../utils/watchRun';

/** How long a run that could not be filed waits before the next try. */
const RETRY_DELAY_MS = 60_000;

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
  // Not until the preferences are in: a miles user's run must not be filed in
  // km because the app started draining before it knew the unit.
  const preferencesLoaded = preferences != null;
  const connectedRef = useRef(isServerConnected && preferencesLoaded);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
    unitRef.current = unit;
    connectedRef.current = isServerConnected && preferencesLoaded;
  }, [t, unit, isServerConnected, preferencesLoaded]);

  const drain = useRef(async () => {
    if (!connectedRef.current) return;
    const days = await processWatchRunQueue(
      unitRef.current,
      (payload, entryId) =>
        announceWatchRun(payload, unitRef.current, tRef.current, entryId)
    );
    for (const day of new Set(days)) invalidateExerciseCache(queryClient, day);
    // A run that failed for a reason that may pass (a 503, a dropped
    // connection) would otherwise wait for the next unrelated trigger.
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    if (await hasQueuedWatchRuns()) {
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        void drain.current().catch(() => undefined);
      }, RETRY_DELAY_MS);
    }
  });
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    []
  );

  // What the watch says about a run in progress, for the phone's live view.
  // The run is over for the view once the watch finishes it, or goes quiet.
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const live = WatchConnectivity.addListener(
      'onRunLive',
      (payload: WatchRunLivePayload) =>
        useWatchRunLiveStore.getState().receive(payload)
    );
    const sweep = setInterval(() => {
      const run = useWatchRunLiveStore.getState().run;
      if (run && Date.now() - run.receivedAt > WATCH_RUN_LIVE_MAX_AGE_MS) {
        useWatchRunLiveStore.getState().clear();
      }
    }, 5000);
    return () => {
      live.remove();
      clearInterval(sweep);
      useWatchRunLiveStore.getState().clear();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const sub = WatchConnectivity.addListener(
      'onRunFinished',
      (raw: WatchRunFinishedPayload) => {
        useWatchRunLiveStore.getState().clear();
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
  }, [enabled, isServerConnected, preferencesLoaded]);
}
