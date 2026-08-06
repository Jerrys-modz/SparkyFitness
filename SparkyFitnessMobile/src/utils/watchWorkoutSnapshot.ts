/**
 * Pure builders for the compact payloads pushed to the watchOS companion app
 * over WatchConnectivity (see `services/watchContext.ts`). Wire shapes live in
 * `types/watchBridge.ts` — kept separate from `activeWorkoutStore.ts` so what
 * gets sent to Swift is an explicit, versionable contract instead of the
 * store's internal fields leaking out.
 *
 * Weight fields are always in the caller-supplied display unit (kg/lbs); the
 * store itself is kg-only. Callers convert with `weightFromKg`/`weightToKg`
 * from `unitConversions.ts`.
 */
import type { WorkoutPreset } from '../types/workoutPresets';
import type { ActiveWorkoutState, CompletedSetMap } from '../stores/activeWorkoutStore';
import type {
  WatchActiveWorkoutPayload,
  WatchPresetSummary,
  WatchSetDot,
  WatchWeightUnit,
} from '../types/watchBridge';
import { describeActiveSetAssumed } from './workoutSession';
import { weightFromKg } from './unitConversions';

/** Trim a full preset list down to what the watch's start screen needs. */
export function buildWatchPresetSummaries(presets: readonly WorkoutPreset[]): WatchPresetSummary[] {
  return presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    exerciseCount: preset.exercises.length,
  }));
}

type ActiveWorkoutSnapshotSource = Pick<
  ActiveWorkoutState,
  | 'sessionId'
  | 'session'
  | 'activeSetId'
  | 'completedSetIds'
  | 'rest'
  | 'startedAt'
  | 'previousSessionSets'
  | 'plannedSetValues'
>;

function buildSetDots(
  sets: readonly { id: number | string }[] | undefined,
  completedSetIds: CompletedSetMap,
  activeSetId: string | null,
): WatchSetDot[] {
  return (sets ?? []).map((s) => {
    const id = String(s.id);
    return {
      id,
      completed: id in completedSetIds,
      isActive: id === activeSetId,
    };
  });
}

/**
 * Build the watch's mirror of the live workout, or `null` when no session is
 * active. Reuses `describeActiveSetAssumed` (the same gray-placeholder
 * resolution the phone HUD renders) so the watch shows identical target
 * reps/weight rather than a second, drifting resolution of "what's next".
 */
export function buildWatchActiveWorkoutPayload(
  state: ActiveWorkoutSnapshotSource,
  weightUnit: WatchWeightUnit,
): WatchActiveWorkoutPayload | null {
  const {
    sessionId,
    session,
    activeSetId,
    completedSetIds,
    rest,
    startedAt,
    previousSessionSets,
    plannedSetValues,
  } = state;
  if (sessionId == null || session == null) return null;

  const exercises = session.exercises;
  const exerciseIndex =
    activeSetId != null
      ? exercises.findIndex((e) => e.sets.some((s) => String(s.id) === activeSetId))
      : exercises.length - 1;
  const exercise = exercises[exerciseIndex >= 0 ? exerciseIndex : Math.max(0, exercises.length - 1)];

  const desc = describeActiveSetAssumed(session, activeSetId, previousSessionSets, plannedSetValues);
  const setDots = buildSetDots(exercise?.sets, completedSetIds, activeSetId);

  return {
    sessionId,
    workoutName: session.name,
    exerciseName: desc?.exerciseName ?? exercise?.exercise_snapshot?.name ?? 'Workout',
    setNumber: desc?.setNumber ?? setDots.length,
    setCount: desc?.setCount ?? setDots.length,
    activeSetId,
    targetReps: desc?.reps ?? null,
    targetWeight: desc?.weightKg != null ? weightFromKg(desc.weightKg, weightUnit) : null,
    weightUnit,
    setDots,
    rest: { state: rest.state, durationSec: rest.durationSec, endsAt: rest.endsAt },
    startedAt,
    isFinished: activeSetId == null,
  };
}
