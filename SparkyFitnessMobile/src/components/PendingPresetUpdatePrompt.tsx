import { useCallback, useMemo } from 'react';
import { AppState } from 'react-native';
import { useWorkoutCompletePresetSync } from '../hooks/useWorkoutCompletePresetSync';
import { notifyPresetUpdateAvailable } from '../services/notifications';
import { usePendingPresetUpdateStore } from '../stores/pendingPresetUpdateStore';
import type { WorkoutCelebration } from '../utils/workoutCelebration';

/**
 * Asks "Update preset?" for a workout finished on the watch while the phone
 * was elsewhere, the same question the completion screen asks after a phone
 * finish. Mount inside the navigation container (the prompt waits for focus).
 */
export default function PendingPresetUpdatePrompt() {
  const pending = usePendingPresetUpdateStore((s) => s.pending);
  const clearPending = usePendingPresetUpdateStore((s) => s.clearPending);
  if (pending == null) return null;
  // Keyed so a newer finish starts a fresh check rather than reusing the
  // old one's "already prompted" state.
  return (
    <PendingPrompt
      key={pending.finishedAt}
      celebration={pending}
      onSettled={clearPending}
    />
  );
}

function PendingPrompt({
  celebration,
  onSettled,
}: {
  celebration: WorkoutCelebration;
  onSettled: () => void;
}) {
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
  // The prompt waits for the app to be in front. With the phone locked or in
  // a pocket, an alert (mirrored to the watch) says there is something to do.
  const handleNeedsUpdate = useCallback((presetName: string) => {
    if (AppState.currentState !== 'active') {
      void notifyPresetUpdateAvailable(presetName);
    }
  }, []);
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
