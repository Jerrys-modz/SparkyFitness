import { useCallback, useEffect, useMemo, useRef } from 'react';
import WatchConnectivity from '../../modules/watch-connectivity';
import {
  useWorkoutCompletePresetSync,
  type PresetUpdateOffer,
} from '../hooks/useWorkoutCompletePresetSync';
import {
  usePendingPresetUpdateStore,
  type PendingPresetUpdate,
} from '../stores/pendingPresetUpdateStore';

/**
 * Asks "Update preset?" for a workout finished on the watch while the phone
 * was elsewhere, the same question the completion screen asks after a phone
 * finish. The watch is asked first, on its post-workout summary; the phone's
 * own prompt waits for the app to be in front and covers a watch that was out
 * of reach or never answered. Mount inside the navigation container (the
 * prompt waits for focus).
 */
export default function PendingPresetUpdatePrompt() {
  const pending = usePendingPresetUpdateStore((s) => s.pending);
  const clearPending = usePendingPresetUpdateStore((s) => s.clearPending);
  if (pending == null) return null;
  // Keyed so a newer finish starts a fresh check rather than reusing the
  // old one's "already prompted" state.
  return (
    <PendingPrompt
      key={pending.celebration.finishedAt}
      pending={pending}
      onSettled={clearPending}
    />
  );
}

function PendingPrompt({
  pending,
  onSettled,
}: {
  pending: PendingPresetUpdate;
  onSettled: () => void;
}) {
  const { celebration, sessionId } = pending;
  const {
    session,
    sourcePresetId,
    sourceServerConfigId,
    completedSetIds,
    plannedSetValues,
    previousSessionSets,
    exerciseConfigs,
    weightUnit,
    workoutFormat,
  } = celebration;
  const assumeSources = useMemo(
    () =>
      previousSessionSets != null && exerciseConfigs != null
        ? {
            previousSessionSets,
            exerciseConfigs,
            weightUnit,
            workoutFormat,
          }
        : undefined,
    [previousSessionSets, exerciseConfigs, weightUnit, workoutFormat]
  );

  const updateRef = useRef<PresetUpdateOffer['update'] | null>(null);
  const answeredRef = useRef(false);

  // The wearer's answer to the question on the watch.
  useEffect(() => {
    if (WatchConnectivity == null) return;
    const sub = WatchConnectivity.addListener(
      'onPresetUpdateAnswer',
      (answer) => {
        if (answer.sessionId !== sessionId || answeredRef.current) return;
        answeredRef.current = true;
        void (async () => {
          if (answer.update) await updateRef.current?.();
          onSettled();
        })();
      }
    );
    return () => sub.remove();
  }, [sessionId, onSettled]);

  const handleNeedsUpdate = useCallback(
    (offer: PresetUpdateOffer) => {
      updateRef.current = offer.update;
      // Not reachable is fine: the phone's own prompt still shows.
      void WatchConnectivity?.offerPresetUpdate(
        sessionId,
        offer.presetName
      ).catch(() => {});
    },
    [sessionId]
  );

  useWorkoutCompletePresetSync({
    session,
    sourcePresetId,
    sourceServerConfigId,
    completedSetIds,
    plannedSetValues,
    assumeSources,
    onSettled,
    onNeedsUpdate: handleNeedsUpdate,
  });
  return null;
}
