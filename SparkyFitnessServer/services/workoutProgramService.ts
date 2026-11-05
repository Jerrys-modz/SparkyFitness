import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  type ImportWorkoutProgramResponse,
  type WorkoutProgramExercise,
  type WorkoutProgramFile,
  type WorkoutProgramPreset,
  type WorkoutProgramSet,
} from '@workspace/shared';
import exerciseRepository from '../models/exerciseRepository.js';
import { log } from '../config/logging.js';
import { describeError } from '../utils/errors.js';
import { addFreeExerciseDBExerciseToUserExercises } from './exerciseService.js';
import workoutPlanTemplateService from './workoutPlanTemplateService.js';
import workoutPresetService from './workoutPresetService.js';

/**
 * Workout program files (`WorkoutPrograms.api.zod.ts`): exporting a preset or a
 * plan as portable JSON, and importing one into a person's own library. The
 * built-in workout splits import through the same path.
 */

const FREE_EXERCISE_DB = 'free-exercise-db';

/** Some exercises could not be added; nothing was created. */
export class WorkoutProgramExercisesUnavailableError extends Error {
  readonly missingExerciseIds: string[];
  constructor(missingExerciseIds: string[]) {
    super(
      'Some exercises could not be added from the exercise database. Try again when it is reachable.'
    );
    this.name = 'WorkoutProgramExercisesUnavailableError';
    this.missingExerciseIds = missingExerciseIds;
  }
}

export class WorkoutProgramNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutProgramNotFoundError';
  }
}

// --- Export ---

interface ExerciseRow {
  id: string;
  source?: string | null;
  source_id?: string | null;
  name: string;
  category?: string | null;
  modality?: WorkoutProgramExercise['modality'];
  level?: string | null;
  force?: string | null;
  mechanic?: string | null;
  equipment?: unknown;
  primary_muscles?: unknown;
  secondary_muscles?: unknown;
  instructions?: unknown;
  description?: string | null;
  calories_per_hour?: number | string | null;
}

interface SetRow {
  set_number: number;
  set_type?: string | null;
  reps?: number | null;
  weight?: number | string | null;
  duration?: number | null;
  distance?: number | string | null;
  rest_time?: number | null;
  notes?: string | null;
}

interface PresetExerciseRow {
  exercise_id: string;
  superset_group?: number | null;
  progression_mode?: WorkoutProgramPreset['exercises'][number]['progressionMode'];
  rep_goal?: number | null;
  increment_type?: 'weight' | 'reps' | null;
  increment_value?: number | string | null;
  ramp_increment?: number | string | null;
  sets?: SetRow[] | null;
}

interface PresetRow {
  id: number;
  name: string;
  description?: string | null;
  workout_format?: WorkoutProgramPreset['workoutFormat'] | null;
  time_cap_seconds?: number | null;
  exercises?: PresetExerciseRow[] | null;
}

/** Library list columns are JSON text on some rows and arrays on others. */
function stringList(value: unknown): string[] | undefined {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return value.trim() ? [value.trim()] : undefined;
    }
  }
  if (!Array.isArray(list)) return undefined;
  const strings = list.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== ''
  );
  return strings.length > 0 ? strings : undefined;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function exportSet(set: SetRow): WorkoutProgramSet {
  return {
    setNumber: set.set_number,
    setType: set.set_type ?? null,
    reps: numberOrNull(set.reps),
    weight: numberOrNull(set.weight),
    duration: numberOrNull(set.duration),
    distance: numberOrNull(set.distance),
    restTime: numberOrNull(set.rest_time),
    notes: set.notes ?? null,
  };
}

function exportExercise(key: string, row: ExerciseRow): WorkoutProgramExercise {
  return {
    key,
    name: row.name,
    source: row.source ?? null,
    sourceId: row.source_id ?? null,
    category: row.category ?? null,
    modality: row.modality ?? null,
    level: row.level ?? null,
    force: row.force ?? null,
    mechanic: row.mechanic ?? null,
    equipment: stringList(row.equipment),
    primaryMuscles: stringList(row.primary_muscles),
    secondaryMuscles: stringList(row.secondary_muscles),
    instructions: stringList(row.instructions),
    description: row.description ?? null,
    caloriesPerHour: numberOrNull(row.calories_per_hour),
  };
}

/** Collects each library exercise once and hands out its key in the file. */
class ExerciseCollector {
  private readonly keys = new Map<string, string>();
  readonly exercises: WorkoutProgramExercise[] = [];

  constructor(private readonly userId: string) {}

  async keyFor(exerciseId: string): Promise<string> {
    const known = this.keys.get(exerciseId);
    if (known) return known;
    const row = (await exerciseRepository.getExerciseById(
      exerciseId,
      this.userId
    )) as ExerciseRow | undefined;
    if (!row) {
      throw new WorkoutProgramNotFoundError(
        `Exercise ${exerciseId} could not be read.`
      );
    }
    const key = `e${this.exercises.length + 1}`;
    this.keys.set(exerciseId, key);
    this.exercises.push(exportExercise(key, row));
    return key;
  }
}

async function exportPreset(
  key: string,
  preset: PresetRow,
  collector: ExerciseCollector
): Promise<WorkoutProgramPreset> {
  const exercises: WorkoutProgramPreset['exercises'] = [];
  for (const exercise of preset.exercises ?? []) {
    exercises.push({
      exercise: await collector.keyFor(exercise.exercise_id),
      supersetGroup: exercise.superset_group ?? null,
      progressionMode: exercise.progression_mode ?? null,
      repGoal: exercise.rep_goal ?? null,
      incrementType: exercise.increment_type ?? null,
      incrementValue: numberOrNull(exercise.increment_value),
      rampIncrement: numberOrNull(exercise.ramp_increment),
      sets: (exercise.sets ?? []).map(exportSet),
    });
  }
  return {
    key,
    name: preset.name,
    description: preset.description ?? null,
    workoutFormat: preset.workout_format ?? 'standard',
    timeCapSeconds: preset.time_cap_seconds ?? null,
    exercises,
  };
}

async function readPreset(
  userId: string,
  presetId: number | string
): Promise<PresetRow> {
  try {
    return (await workoutPresetService.getWorkoutPresetById(
      userId,
      presetId
    )) as PresetRow;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Workout preset not found.'
    ) {
      throw new WorkoutProgramNotFoundError(error.message);
    }
    throw error;
  }
}

function fileOf(
  exercises: WorkoutProgramExercise[],
  presets: WorkoutProgramPreset[],
  plan: WorkoutProgramFile['plan']
): WorkoutProgramFile {
  return {
    format: WORKOUT_PROGRAM_FILE_FORMAT,
    version: WORKOUT_PROGRAM_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    exercises,
    presets,
    plan,
  };
}

/** A preset someone can see (their own, public or family-shared) as a file. */
export async function exportWorkoutPreset(
  userId: string,
  presetId: number | string
): Promise<WorkoutProgramFile> {
  const preset = await readPreset(userId, presetId);
  const collector = new ExerciseCollector(userId);
  const exported = await exportPreset('p1', preset, collector);
  return fileOf(collector.exercises, [exported], null);
}

/** A plan someone can see, with every preset it runs, as a file. */
export async function exportWorkoutPlan(
  userId: string,
  planId: number | string
): Promise<WorkoutProgramFile> {
  let plan;
  try {
    plan = await workoutPlanTemplateService.getWorkoutPlanTemplateById(
      userId,
      planId
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Workout plan template not found.'
    ) {
      throw new WorkoutProgramNotFoundError(error.message);
    }
    throw error;
  }

  const collector = new ExerciseCollector(userId);
  const presetKeys = new Map<string, string>();
  const presets: WorkoutProgramPreset[] = [];
  const sessions: NonNullable<WorkoutProgramFile['plan']>['sessions'] = [];
  const isWeekly = plan.schedule_type !== 'sequential';

  for (const assignment of plan.assignments ?? []) {
    const slot = {
      dayOfWeek: isWeekly ? (assignment.day_of_week ?? null) : null,
      sessionIndex: isWeekly ? null : (assignment.session_index ?? null),
      sessionName: assignment.session_name ?? null,
    };
    if (
      assignment.workout_preset_id !== null &&
      assignment.workout_preset_id !== undefined
    ) {
      const presetId = String(assignment.workout_preset_id);
      let presetKey = presetKeys.get(presetId);
      if (!presetKey) {
        presetKey = `p${presets.length + 1}`;
        presetKeys.set(presetId, presetKey);
        const preset = await readPreset(userId, presetId);
        presets.push(await exportPreset(presetKey, preset, collector));
      }
      sessions.push({ ...slot, preset: presetKey });
    } else if (assignment.exercise_id) {
      sessions.push({
        ...slot,
        exercise: await collector.keyFor(assignment.exercise_id),
        sets: (assignment.sets ?? []).map((set) => exportSet(set as SetRow)),
      });
    }
  }

  return fileOf(collector.exercises, presets, {
    name: plan.plan_name ?? 'Workout plan',
    description: plan.description ?? null,
    scheduleType: isWeekly ? 'weekly' : 'sequential',
    entryMode: plan.entry_mode ?? 'prompt',
    sessions,
  });
}

// --- Import ---

export interface ImportWorkoutProgramOptions {
  /** Replaces the plan's name. */
  planName?: string;
  activate: boolean;
  /**
   * When an exercise database exercise cannot be fetched, build it as a
   * custom exercise from the file's definition instead of failing. Off for
   * the built-in splits, whose files carry ids only.
   */
  allowCustomExercises: boolean;
}

interface CreatedRow {
  id: number;
}

interface LibraryExercise {
  id: string;
  user_id?: string | null;
}

async function createCustomExercise(
  userId: string,
  exercise: WorkoutProgramExercise
): Promise<LibraryExercise> {
  return (await exerciseRepository.createExercise({
    user_id: userId,
    source: 'custom',
    source_id: null,
    name: exercise.name,
    category: exercise.category ?? 'general',
    modality: exercise.modality ?? undefined,
    level: exercise.level ?? null,
    force: exercise.force ?? null,
    mechanic: exercise.mechanic ?? null,
    equipment: exercise.equipment ?? null,
    primary_muscles: exercise.primaryMuscles ?? null,
    secondary_muscles: exercise.secondaryMuscles ?? null,
    instructions: exercise.instructions ?? null,
    description: exercise.description ?? null,
    calories_per_hour: exercise.caloriesPerHour ?? 0,
    images: null,
    is_custom: true,
    shared_with_public: false,
  })) as LibraryExercise;
}

/**
 * The person's library exercise for each exercise in the file. An exercise
 * database exercise is reused or added from there; anything else is matched
 * by name in the person's own library, or created as a custom exercise. All
 * exercises are tried before giving up, so the error names every one missing.
 */
async function resolveLibraryExercises(
  userId: string,
  exercises: WorkoutProgramExercise[],
  allowCustomExercises: boolean
): Promise<{ libraryIds: Map<string, string>; addedCount: number }> {
  const libraryIds = new Map<string, string>();
  const missing: string[] = [];
  let addedCount = 0;

  for (const exercise of exercises) {
    if (exercise.source === FREE_EXERCISE_DB && exercise.sourceId) {
      try {
        const existing =
          (await exerciseRepository.getExerciseBySourceAndSourceId(
            FREE_EXERCISE_DB,
            exercise.sourceId,
            userId
          )) as LibraryExercise | undefined;
        if (existing) {
          libraryIds.set(exercise.key, existing.id);
          continue;
        }
        const added = (await addFreeExerciseDBExerciseToUserExercises(
          userId,
          exercise.sourceId
        )) as LibraryExercise;
        libraryIds.set(exercise.key, added.id);
        addedCount += 1;
        continue;
      } catch (error) {
        log(
          'warn',
          `Workout program import: could not add free-exercise-db exercise ${exercise.sourceId}: ${describeError(error)}`
        );
        if (!allowCustomExercises) {
          missing.push(exercise.sourceId);
          continue;
        }
      }
    }

    try {
      const sameName = (await exerciseRepository.findExerciseByNameAndUserId(
        exercise.name,
        userId
      )) as LibraryExercise | undefined;
      // The lookup also returns other people's public exercises; only the
      // person's own copy is reused, so the preset never depends on theirs.
      if (sameName && sameName.user_id === userId) {
        libraryIds.set(exercise.key, sameName.id);
        continue;
      }
      const created = await createCustomExercise(userId, exercise);
      libraryIds.set(exercise.key, created.id);
      addedCount += 1;
    } catch (error) {
      log(
        'warn',
        `Workout program import: could not add exercise "${exercise.name}": ${describeError(error)}`
      );
      missing.push(exercise.sourceId || exercise.name);
    }
  }

  if (missing.length > 0) {
    throw new WorkoutProgramExercisesUnavailableError(missing);
  }
  return { libraryIds, addedCount };
}

function setPayload(set: WorkoutProgramSet) {
  return {
    set_number: set.setNumber,
    set_type: set.setType ?? null,
    reps: set.reps ?? null,
    weight: set.weight ?? null,
    duration: set.duration ?? null,
    distance: set.distance ?? null,
    rest_time: set.restTime ?? null,
    notes: set.notes ?? null,
  };
}

function presetPayload(
  preset: WorkoutProgramPreset,
  libraryIds: Map<string, string>
) {
  return {
    name: preset.name,
    description: preset.description ?? null,
    is_public: false,
    workout_format: preset.workoutFormat,
    time_cap_seconds: preset.timeCapSeconds ?? null,
    exercises: preset.exercises.map((exercise, index) => ({
      exercise_id: libraryIds.get(exercise.exercise) as string,
      sort_order: index,
      superset_group: exercise.supersetGroup ?? null,
      progression_mode: exercise.progressionMode ?? null,
      rep_goal: exercise.repGoal ?? null,
      increment_type: exercise.incrementType ?? null,
      increment_value: exercise.incrementValue ?? null,
      ramp_increment: exercise.rampIncrement ?? null,
      sets: exercise.sets.map(setPayload),
    })),
  };
}

async function removeCreatedPresets(
  userId: string,
  presetIds: number[]
): Promise<void> {
  for (const presetId of presetIds) {
    try {
      await workoutPresetService.deleteWorkoutPreset(userId, presetId);
    } catch (error) {
      log(
        'error',
        `Workout program import: could not remove preset ${presetId} after a failure: ${describeError(error)}`
      );
    }
  }
}

/**
 * Makes the person's own copy of a program file: its exercises in their
 * library, each preset as their own private preset, and the plan (if any) as
 * their own plan running those presets. Exercises are resolved first, so an
 * unreachable exercise database fails before any preset exists; if a later
 * step fails, the presets made so far are removed again. Exercises added to
 * the library are kept, as adding them again is idempotent.
 */
export async function importWorkoutProgram(
  userId: string,
  program: WorkoutProgramFile,
  options: ImportWorkoutProgramOptions
): Promise<ImportWorkoutProgramResponse> {
  const { libraryIds, addedCount } = await resolveLibraryExercises(
    userId,
    program.exercises,
    options.allowCustomExercises
  );

  const presetIds: Record<string, number> = {};
  try {
    for (const preset of program.presets) {
      const created = (await workoutPresetService.createWorkoutPreset(
        userId,
        presetPayload(preset, libraryIds)
      )) as CreatedRow;
      presetIds[preset.key] = created.id;
    }

    let planId: number | null = null;
    if (program.plan) {
      const plan = program.plan;
      const created =
        (await workoutPlanTemplateService.createWorkoutPlanTemplate(userId, {
          plan_name: options.planName ?? plan.name,
          description: plan.description ?? null,
          is_active: options.activate,
          schedule_type: plan.scheduleType,
          entry_mode: plan.entryMode,
          assignments: plan.sessions.map((session, index) => ({
            day_of_week:
              plan.scheduleType === 'weekly'
                ? (session.dayOfWeek ?? null)
                : null,
            session_index:
              plan.scheduleType === 'sequential'
                ? (session.sessionIndex ?? index + 1)
                : null,
            session_name: session.sessionName ?? null,
            workout_preset_id: session.preset
              ? presetIds[session.preset]
              : null,
            exercise_id: session.exercise
              ? (libraryIds.get(session.exercise) ?? null)
              : null,
            sort_order: index,
            sets: session.exercise ? (session.sets ?? []).map(setPayload) : [],
          })),
        })) as CreatedRow;
      planId = created.id;
    }

    return { planId, presetIds, addedExerciseCount: addedCount };
  } catch (error) {
    await removeCreatedPresets(userId, Object.values(presetIds));
    throw error;
  }
}
