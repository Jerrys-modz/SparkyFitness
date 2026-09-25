/**
 * The watch tags a heart-rate batch with whichever exercise it is showing.
 * A set logged on the phone never moves that cursor, so the whole workout
 * would land on the first exercise. The phone's completion timestamps are
 * the record of which set was actually current, from either device.
 */

export interface AttributionStep {
  setId: string;
  exerciseEntryId: string;
}

export interface WatchSample {
  t: string;
  bpm: number;
}

export interface AttributedWatchBatch {
  samplesByExercise: Map<string, WatchSample[]>;
  /** Shares of this batch's energy delta. Empty when the batch had none. */
  energyByExercise: Map<string, number>;
  /**
   * Wall-clock minutes each exercise was the current one. Null when the
   * phone's timeline still agrees with the watch, so the watch's own
   * duration should be kept.
   */
  durationsByExercise: Map<string, number> | null;
}

function exerciseEntryAt(
  atMs: number,
  steps: AttributionStep[],
  completedAtBySetId: Record<string, number>,
  fallback: string
): string {
  for (const step of steps) {
    const completed = completedAtBySetId[step.setId];
    if (completed == null || completed > atMs) return step.exerciseEntryId;
  }
  return steps.length > 0 ? steps[steps.length - 1].exerciseEntryId : fallback;
}

function minutesBetween(startMs: number, endMs: number): number {
  return Math.max(0, endMs - startMs) / 60_000;
}

/**
 * Minutes each exercise was current: from the previous set's completion
 * (or the workout start) until its own, and the open set until `now`.
 */
function durationsFromTimeline(
  steps: AttributionStep[],
  completedAtBySetId: Record<string, number>,
  startedAt: number,
  now: number
): Map<string, number> {
  const totals = new Map<string, number>();
  let cursor = startedAt;
  for (const step of steps) {
    const completed = completedAtBySetId[step.setId];
    const end = completed != null ? completed : now;
    const minutes = minutesBetween(cursor, end);
    if (minutes > 0) {
      const rounded = Math.round(minutes * 100) / 100;
      totals.set(
        step.exerciseEntryId,
        Math.round(((totals.get(step.exerciseEntryId) ?? 0) + rounded) * 100) /
          100
      );
    }
    if (completed == null) break;
    cursor = completed;
  }
  return totals;
}

export function attributeWatchBatch(input: {
  samples: WatchSample[];
  activeEnergyKcal?: number | null;
  taggedExerciseEntryId: string;
  steps: AttributionStep[];
  completedAtBySetId: Record<string, number>;
  startedAt: number | null;
  now: number;
}): AttributedWatchBatch {
  const {
    samples,
    taggedExerciseEntryId,
    steps,
    completedAtBySetId,
    startedAt,
    now,
  } = input;
  const samplesByExercise = new Map<string, WatchSample[]>();
  const push = (exerciseEntryId: string, sample: WatchSample) => {
    const list = samplesByExercise.get(exerciseEntryId);
    if (list) list.push(sample);
    else samplesByExercise.set(exerciseEntryId, [sample]);
  };

  let moved = false;
  for (const sample of samples) {
    const atMs = Date.parse(sample.t);
    const exerciseEntryId =
      steps.length > 0 && Number.isFinite(atMs)
        ? exerciseEntryAt(
            atMs,
            steps,
            completedAtBySetId,
            taggedExerciseEntryId
          )
        : taggedExerciseEntryId;
    if (exerciseEntryId !== taggedExerciseEntryId) moved = true;
    push(exerciseEntryId, sample);
  }

  const current =
    steps.length > 0
      ? exerciseEntryAt(now, steps, completedAtBySetId, taggedExerciseEntryId)
      : taggedExerciseEntryId;
  const durationsByExercise =
    startedAt != null &&
    steps.length > 0 &&
    (moved || current !== taggedExerciseEntryId)
      ? durationsFromTimeline(steps, completedAtBySetId, startedAt, now)
      : null;

  const energyByExercise = new Map<string, number>();
  const kcal = input.activeEnergyKcal;
  if (typeof kcal === 'number' && Number.isFinite(kcal) && samples.length > 0) {
    const groups = [...samplesByExercise.entries()];
    let assigned = 0;
    groups.forEach(([exerciseEntryId, group], index) => {
      const share =
        index === groups.length - 1
          ? Math.round((kcal - assigned) * 100) / 100
          : Math.round(((kcal * group.length) / samples.length) * 100) / 100;
      assigned = Math.round((assigned + share) * 100) / 100;
      if (share !== 0) energyByExercise.set(exerciseEntryId, share);
    });
  } else if (typeof kcal === 'number' && Number.isFinite(kcal)) {
    energyByExercise.set(taggedExerciseEntryId, kcal);
  }

  return { samplesByExercise, energyByExercise, durationsByExercise };
}
