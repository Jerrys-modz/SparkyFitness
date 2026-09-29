import { useEffect } from 'react';
import type { PresetSessionResponse } from '@workspace/shared';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import WatchConnectivity, {
  type WatchSetTargetPayload,
} from '../../modules/watch-connectivity';
import {
  historyForExercise,
  resolveLiveAssumedSetValues,
} from '../utils/workoutSession';

type ActiveWorkoutState = ReturnType<typeof useActiveWorkoutStore.getState>;

/** The store fields a set's target resolves from. */
type TargetSources = Pick<
  ActiveWorkoutState,
  | 'previousSessionSets'
  | 'plannedSetValues'
  | 'exerciseConfigs'
  | 'coachingSignals'
  | 'declinedAdaptive'
  | 'weightUnit'
  | 'workoutFormat'
>;

/**
 * Weight/reps the watch should show for every set: what was entered on the
 * phone, else the value the phone's own row shows in gray — the preset's
 * planned value with the progression bump, ramp and adaptive adjustment
 * applied. Keyed by set id.
 */
export function resolveWatchSetTargets(
  session: PresetSessionResponse,
  sources: TargetSources
): Map<string, { weightKg: number | null; reps: number | null }> {
  const targets = new Map<
    string,
    { weightKg: number | null; reps: number | null }
  >();
  for (const exercise of session.exercises) {
    const assumed = resolveLiveAssumedSetValues(
      exercise,
      historyForExercise(sources.previousSessionSets, exercise.exercise_id),
      sources
    );
    exercise.sets.forEach((set, index) => {
      targets.set(String(set.id), {
        weightKg: set.weight ?? assumed[index]?.weight ?? null,
        reps: set.reps ?? assumed[index]?.reps ?? null,
      });
    });
  }
  return targets;
}

/**
 * Keeps a paired watch's set targets, completions and rest in step with the
 * phone.
 * The plan the watch is armed with is built at live start, before each
 * exercise's history has loaded, so it only carries the preset's planned
 * values — without this a progression bump shown on the phone never reaches
 * the wrist, and a set logged on the phone stays open on the watch. Each
 * change sends the full target list and completed set ids; the watch keeps
 * the newest revision and still prefers anything the wearer typed there.
 */
export function useWatchSetTargetsSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const watch = WatchConnectivity;
    let lastSent: { sessionId: string; key: string } | null = null;
    let lastRevision = 0;

    const sync = (state: ActiveWorkoutState): void => {
      const { session, watchArmedAt } = state;
      if (session == null || session.type !== 'preset') return;
      // Nothing until this session has been armed on the watch: an update
      // queued ahead of its `workoutStart` has no plan to land on.
      if (watchArmedAt == null) return;
      const targets: WatchSetTargetPayload[] = [];
      for (const [setId, value] of resolveWatchSetTargets(session, state)) {
        targets.push({
          setId,
          ...(value.weightKg != null ? { targetWeightKg: value.weightKg } : {}),
          ...(value.reps != null ? { targetReps: value.reps } : {}),
        });
      }
      const completedSetIds = Object.keys(state.completedSetIds).sort();
      const rest =
        state.rest.state === 'resting' && state.rest.endsAt != null
          ? {
              restEndsAt: state.rest.endsAt,
              restDurationSeconds: state.rest.durationSec,
            }
          : {};
      const key = JSON.stringify([
        watchArmedAt,
        targets,
        completedSetIds,
        rest,
      ]);
      if (lastSent?.sessionId === session.id && lastSent.key === key) return;
      lastSent = { sessionId: session.id, key };
      // Wall-clock based so a JS restart cannot send a revision the watch
      // already has; bumped past the last one for sends in the same ms.
      lastRevision = Math.max(lastRevision + 1, Date.now());
      void watch.updateSetTargets({
        sessionId: session.id,
        armedAt: watchArmedAt,
        revision: lastRevision,
        targets,
        completedSetIds,
        ...rest,
      });
    };

    sync(useActiveWorkoutStore.getState());
    return useActiveWorkoutStore.subscribe((state, prev) => {
      if (
        state.session === prev.session &&
        state.completedSetIds === prev.completedSetIds &&
        state.watchArmedAt === prev.watchArmedAt &&
        state.rest === prev.rest &&
        state.previousSessionSets === prev.previousSessionSets &&
        state.plannedSetValues === prev.plannedSetValues &&
        state.exerciseConfigs === prev.exerciseConfigs &&
        state.coachingSignals === prev.coachingSignals &&
        state.declinedAdaptive === prev.declinedAdaptive &&
        state.weightUnit === prev.weightUnit &&
        state.workoutFormat === prev.workoutFormat
      ) {
        return;
      }
      sync(state);
    });
  }, [enabled]);
}
