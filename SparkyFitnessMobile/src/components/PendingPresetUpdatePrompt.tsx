import { useMemo } from 'react';
import { useWorkoutCompletePresetSync } from '../hooks/useWorkoutCompletePresetSync';
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
  useWorkoutCompletePresetSync({
    session,
    sourcePresetId,
    sourceServerConfigId,
    completedSetIds,
    plannedSetValues,
    assumeSources,
    onSettled,
  });
  return null;
}
