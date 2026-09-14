import type {
  CompletedSetHistory,
  ExerciseProgressionConfig,
  LastExercisePerformance,
  ProgressionEvaluationResult,
  ProgressionIncrementType,
  ProgressionMode,
} from "../types/progression.ts";

const DEFAULT_PER_SET_REPS = 8;
const DEFAULT_INCREMENT_VALUE = 5;

export function isWarmupSetType(setType: string | null | undefined): boolean {
  return (setType ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .startsWith("warmup");
}

export function filterWorkingSets<
  T extends { set_type?: string | null; setType?: string | null },
>(sets: T[]): T[] {
  return sets.filter(
    (set) => !isWarmupSetType(set.set_type ?? set.setType ?? null),
  );
}

function resolvedMode(config: ExerciseProgressionConfig): ProgressionMode {
  return config.progressionMode ?? "rep_goal";
}

function perSetRepGoal(config: ExerciseProgressionConfig): number {
  return config.repGoal ?? DEFAULT_PER_SET_REPS;
}

function totalRepGoal(config: ExerciseProgressionConfig): number {
  return config.repGoal ?? config.targetSets * DEFAULT_PER_SET_REPS;
}

function workingHistory(last: LastExercisePerformance) {
  return last.sets.filter(
    (set) =>
      set.completed !== false && set.reps > 0 && !isWarmupSetType(set.setType),
  );
}

function bumpOnSuccess(
  config: ExerciseProgressionConfig,
  last: LastExercisePerformance,
  currentRepGoal: number,
): Pick<
  ProgressionEvaluationResult,
  "status" | "suggestedWeight" | "suggestedRepGoal"
> {
  const mode = resolvedMode(config);
  const bumpReps = mode === "step_load" || config.incrementType === "reps";
  if (bumpReps) {
    return {
      status: "PROGRESSION_REPS_INCREASE",
      suggestedWeight: last.baseWeight,
      suggestedRepGoal: currentRepGoal + config.incrementValue,
    };
  }
  return {
    status: "PROGRESSION_WEIGHT_INCREASE",
    suggestedWeight: last.baseWeight + config.incrementValue,
    suggestedRepGoal: currentRepGoal,
  };
}

/**
 * Map preset/wire snake_case fields onto the engine config. Weights and
 * incrementValue stay in kg; callers convert at UI edges.
 */
export function progressionConfigFromPresetExercise(fields: {
  progression_mode?: ProgressionMode | string | null;
  rep_goal?: number | null;
  increment_type?: ProgressionIncrementType | string | null;
  increment_value?: number | string | null;
  equipment_brand?: string | null;
  sets: { set_type?: string | null; setType?: string | null }[];
}): ExerciseProgressionConfig {
  const working = filterWorkingSets(fields.sets);
  const incrementValue = Number(fields.increment_value);
  const mode = fields.progression_mode;
  return {
    progressionMode:
      mode === "fixed" ||
      mode === "step_load" ||
      mode === "manual" ||
      mode === "rep_goal"
        ? mode
        : "rep_goal",
    targetSets: working.length || 3,
    repGoal: fields.rep_goal ?? undefined,
    incrementType:
      fields.increment_type === "reps" || mode === "step_load"
        ? "reps"
        : "weight",
    incrementValue:
      Number.isFinite(incrementValue) && incrementValue > 0
        ? incrementValue
        : DEFAULT_INCREMENT_VALUE,
    equipmentBrand: fields.equipment_brand,
  };
}

/**
 * Collapse GET /v2/exercises/:id/stats `recentSessions[0]` into the engine's
 * last-session shape. Warmups stay in `sets`; evaluateProgression ignores them.
 */
export function lastPerformanceFromRecentSession(
  session?: {
    entryDate?: string;
    sets: {
      setNumber: number;
      setType?: string | null;
      weight: number | null;
      reps: number | null;
    }[];
  } | null,
): LastExercisePerformance | null {
  if (!session?.sets?.length) {
    return null;
  }

  const sets: CompletedSetHistory[] = session.sets.map((set) => ({
    setNumber: set.setNumber,
    reps: set.reps ?? 0,
    weight: set.weight ?? 0,
    setType: set.setType,
  }));
  const working = sets.filter(
    (set) => !isWarmupSetType(set.setType) && set.reps > 0,
  );
  const baseWeight =
    working.find((set) => set.weight > 0)?.weight ??
    [...sets].reverse().find((set) => set.weight > 0)?.weight ??
    0;

  return {
    date: session.entryDate,
    baseWeight,
    sets,
  };
}

/**
 * Pure overload evaluator. Weights and incrementValue must be in the same
 * unit (the app stores kg). Callers filter warmups out of lastPerformance
 * or leave them in — this function ignores warmup rows.
 *
 * Modes:
 * - rep_goal: sum of working-set reps must meet the total repGoal
 * - fixed: each of targetSets working sets must meet the per-set repGoal
 * - step_load: same achievement as fixed, then always increment reps
 * - manual: never auto-progress
 */
export function evaluateProgression(
  config: ExerciseProgressionConfig,
  lastPerformance?: LastExercisePerformance | null,
): ProgressionEvaluationResult {
  const mode = resolvedMode(config);

  if (mode === "manual") {
    return {
      goalAchieved: false,
      status: "MANUAL",
      suggestedWeight: lastPerformance?.baseWeight ?? 0,
      suggestedRepGoal: config.repGoal ?? 0,
      totalRepsAchieved: 0,
      repDifference: 0,
      message: "Manual progression mode.",
    };
  }

  const totalGoal = totalRepGoal(config);
  const setGoal = perSetRepGoal(config);

  if (
    !lastPerformance ||
    !lastPerformance.sets ||
    lastPerformance.sets.length === 0
  ) {
    return {
      goalAchieved: false,
      status: "FIRST_SESSION",
      suggestedWeight: 0,
      suggestedRepGoal: mode === "rep_goal" ? totalGoal : setGoal,
      totalRepsAchieved: 0,
      repDifference: -(mode === "rep_goal" ? totalGoal : setGoal),
      message: "First session for this exercise. Establish baseline.",
    };
  }

  const validSets = workingHistory(lastPerformance);
  const totalRepsAchieved = validSets.reduce((sum, set) => sum + set.reps, 0);

  if (mode === "fixed" || mode === "step_load") {
    const successfulSets = validSets.filter(
      (set) => set.reps >= setGoal,
    ).length;
    const goalAchieved =
      validSets.length >= config.targetSets &&
      successfulSets >= config.targetSets;
    const totalTargetReps = config.targetSets * setGoal;
    const repDifference = totalRepsAchieved - totalTargetReps;

    if (goalAchieved) {
      const bump = bumpOnSuccess(config, lastPerformance, setGoal);
      return {
        goalAchieved: true,
        ...bump,
        totalRepsAchieved,
        repDifference,
        message:
          bump.status === "PROGRESSION_WEIGHT_INCREASE"
            ? `All ${config.targetSets} sets reached ${setGoal} reps. Increase weight to ${bump.suggestedWeight}.`
            : `All ${config.targetSets} sets reached ${setGoal} reps. Increase target to ${bump.suggestedRepGoal}.`,
      };
    }

    return {
      goalAchieved: false,
      status: "MAINTAIN_TARGET",
      suggestedWeight: lastPerformance.baseWeight,
      suggestedRepGoal: setGoal,
      totalRepsAchieved,
      repDifference,
      message: `${successfulSets}/${config.targetSets} sets reached ${setGoal} reps. Hold weight.`,
    };
  }

  // rep_goal (default): cumulative working-set reps vs total target
  const goalAchieved = totalRepsAchieved >= totalGoal;
  const repDifference = totalRepsAchieved - totalGoal;

  if (goalAchieved) {
    const bump = bumpOnSuccess(config, lastPerformance, totalGoal);
    return {
      goalAchieved: true,
      ...bump,
      totalRepsAchieved,
      repDifference,
      message:
        bump.status === "PROGRESSION_WEIGHT_INCREASE"
          ? `Hit ${totalRepsAchieved}/${totalGoal} reps. Increase weight to ${bump.suggestedWeight}.`
          : `Hit ${totalRepsAchieved}/${totalGoal} reps. Increase target to ${bump.suggestedRepGoal}.`,
    };
  }

  return {
    goalAchieved: false,
    status: "MAINTAIN_TARGET",
    suggestedWeight: lastPerformance.baseWeight,
    suggestedRepGoal: totalGoal,
    totalRepsAchieved,
    repDifference,
    message: `Goal not reached (${totalRepsAchieved}/${totalGoal} reps). Hold weight.`,
  };
}

export interface ProgressableSet {
  set_type?: string | null;
  setType?: string | null;
  reps: number | null;
  weight: number | null;
}

/**
 * Rewrite working-set weight/reps from an evaluation. Warmups are left
 * untouched. FIRST_SESSION / MANUAL / missed goals leave the template as-is
 * so stored preset values are not blanked.
 */
export function applyProgressionToSets<T extends ProgressableSet>(
  sets: T[],
  config: ExerciseProgressionConfig,
  evaluation: ProgressionEvaluationResult,
): T[] {
  if (!evaluation.goalAchieved) {
    return sets;
  }

  const mode = resolvedMode(config);
  const bumpReps = evaluation.status === "PROGRESSION_REPS_INCREASE";
  const working = sets.filter(
    (set) => !isWarmupSetType(set.set_type ?? set.setType ?? null),
  );
  const workingCount = working.length || config.targetSets;

  return sets.map((set) => {
    if (isWarmupSetType(set.set_type ?? set.setType ?? null)) {
      return set;
    }
    if (!bumpReps) {
      return { ...set, weight: evaluation.suggestedWeight };
    }
    if (mode === "rep_goal") {
      const base = Math.floor(evaluation.suggestedRepGoal / workingCount);
      const remainder = evaluation.suggestedRepGoal % workingCount;
      const index = working.indexOf(set);
      return {
        ...set,
        reps: base + (index >= 0 && index < remainder ? 1 : 0),
      };
    }
    return { ...set, reps: evaluation.suggestedRepGoal };
  });
}
