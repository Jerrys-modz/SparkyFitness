import type { TrainingConsistency } from '../schemas/api/TrainingConsistency.api.zod.ts';
import { addDays, dayOfWeek } from './timezone.ts';
import {
  calculateMuscleGroupSets,
  workingSetCount,
  type MuscleEntry,
} from './exerciseMuscleAggregates.ts';
import { resolveExerciseModality } from '../constants/exercise.ts';
import type { TrainingConsistencyModality } from '../schemas/api/TrainingConsistency.api.zod.ts';

export type TrainingConsistencyEntry = MuscleEntry & {
  entry_date?: string;
  exercise_modality?: string | null;
  exercise_category?: string | null;
  exercise_equipment?: unknown;
};

function equipmentList(value: unknown): string[] | string | null {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return typeof parsed === 'string' ? parsed : value;
  } catch {
    return value;
  }
}

/**
 * A strength workout: at least one working set, on an exercise whose modality
 * is not distance-based cardio. Entries without sets (a synced walk, an
 * elliptical session, a stretch logged by duration) are not strength, whatever
 * their category says.
 */
export function isStrengthTrainingEntry(
  entry: TrainingConsistencyEntry
): boolean {
  if (workingSetCount(entry.sets) === 0) return false;
  const modality = resolveExerciseModality(
    entry.exercise_modality,
    entry.exercise_category,
    equipmentList(entry.exercise_equipment)
  );
  return modality !== 'duration_distance';
}

/**
 * Keeps the entries that count for the chosen view: `strength` keeps strength
 * workouts, `cardio` keeps every other activity, `all` keeps everything.
 */
export function filterTrainingConsistencyEntries<
  T extends TrainingConsistencyEntry,
>(entries: readonly T[], modality: TrainingConsistencyModality): T[] {
  if (modality === 'all') return [...entries];
  const wantStrength = modality === 'strength';
  return entries.filter(
    (entry) => isStrengthTrainingEntry(entry) === wantStrength
  );
}

/** How many weeks of history the consistency view looks at. */
export const TRAINING_CONSISTENCY_WEEKS = 26;

/**
 * First day of the week that contains `day`. `firstDayOfWeek` follows the
 * account preference (0 = Sunday ... 6 = Saturday) and defaults to Monday.
 */
export function weekStartOf(day: string, firstDayOfWeek: number = 1): string {
  return addDays(day, -((dayOfWeek(day) - firstDayOfWeek + 7) % 7));
}

function dayOnly(value: string): string {
  return value.length === 10 ? value : value.slice(0, 10);
}

/**
 * Training days, weekly streak and working sets per muscle for the current and
 * previous week. `entries` are logged exercise entries; any with a date counts
 * as a workout day, the way the exercise dashboard's own streak does. Entries
 * outside the window are ignored.
 */
export function buildTrainingConsistency(
  entries: readonly TrainingConsistencyEntry[],
  today: string,
  weekCount: number = TRAINING_CONSISTENCY_WEEKS,
  firstDayOfWeek: number = 1
): TrainingConsistency {
  const currentWeekStart = weekStartOf(today, firstDayOfWeek);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weekCount - 1));
  const lastWeekStart = addDays(currentWeekStart, -7);

  const daysByWeek = new Map<string, Set<string>>();
  for (let i = 0; i < weekCount; i += 1) {
    daysByWeek.set(addDays(firstWeekStart, 7 * i), new Set());
  }
  const thisWeekEntries: TrainingConsistencyEntry[] = [];
  const lastWeekEntries: TrainingConsistencyEntry[] = [];

  for (const entry of entries) {
    if (!entry.entry_date) continue;
    const day = dayOnly(entry.entry_date);
    if (day > today) continue;
    const weekStart = weekStartOf(day, firstDayOfWeek);
    const bucket = daysByWeek.get(weekStart);
    if (!bucket) continue;
    bucket.add(day);
    if (weekStart === currentWeekStart) thisWeekEntries.push(entry);
    else if (weekStart === lastWeekStart) lastWeekEntries.push(entry);
  }

  const weeks = [...daysByWeek.entries()].map(([weekStart, days]) => ({
    weekStart,
    workoutDays: days.size,
  }));
  const trainingDays = [...daysByWeek.values()]
    .flatMap((days) => [...days])
    .sort();

  let longest = 0;
  let run = 0;
  for (const week of weeks) {
    run = week.workoutDays > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  // Count back from the current week, or from last week while this one is
  // still empty.
  let index = weeks.length - 1;
  if (weeks[index]!.workoutDays === 0) index -= 1;
  let current = 0;
  while (index >= 0 && weeks[index]!.workoutDays > 0) {
    current += 1;
    index -= 1;
  }

  return {
    today,
    firstDayOfWeek,
    weeks,
    trainingDays,
    weeklyStreak: { current, longest },
    muscleSets: {
      thisWeek: calculateMuscleGroupSets(thisWeekEntries),
      lastWeek: calculateMuscleGroupSets(lastWeekEntries),
    },
  };
}
