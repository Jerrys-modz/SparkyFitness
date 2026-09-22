export interface MuscleEntry {
  entry_date?: string;
  exercise_name?: string;
  exercises?: { primary_muscles?: unknown } | null;
  exercise_primary_muscles?: unknown;
}

function asMuscleNames(values: unknown[]): string[] {
  return values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/**
 * Reads primary muscles from either the nested getReportsData shape
 * (already-parsed array, or a leftover JSON string) or the flat
 * getExerciseEntries column `exercise_primary_muscles`.
 */
export function primaryMusclesOf(entry: MuscleEntry): string[] {
  const nested = entry.exercises?.primary_muscles;
  if (nested !== undefined && nested !== null) {
    return asMuscleNames(parseJsonArray(nested));
  }
  return asMuscleNames(parseJsonArray(entry.exercise_primary_muscles));
}

export function calculateMuscleGroupRecovery(
  exerciseEntries: MuscleEntry[],
): Record<string, string> {
  const recoveryData: Record<string, string> = {};
  for (const entry of exerciseEntries) {
    if (!entry.entry_date) continue;
    for (const muscle of primaryMusclesOf(entry)) {
      if (!recoveryData[muscle] || entry.entry_date > recoveryData[muscle]) {
        recoveryData[muscle] = entry.entry_date;
      }
    }
  }
  return recoveryData;
}

export function calculateExerciseVariety(
  exerciseEntries: MuscleEntry[],
): Record<string, number> {
  const muscleExerciseMap: Record<string, Set<string>> = {};
  for (const entry of exerciseEntries) {
    const name = entry.exercise_name;
    if (!name) continue;
    for (const muscle of primaryMusclesOf(entry)) {
      const bucket = muscleExerciseMap[muscle] ?? new Set<string>();
      muscleExerciseMap[muscle] = bucket;
      bucket.add(name);
    }
  }
  const varietyData: Record<string, number> = {};
  for (const muscle of Object.keys(muscleExerciseMap)) {
    varietyData[muscle] = muscleExerciseMap[muscle]?.size ?? 0;
  }
  return varietyData;
}
