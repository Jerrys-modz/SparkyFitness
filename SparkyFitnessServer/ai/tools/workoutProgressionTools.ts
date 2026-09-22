import { tool } from 'ai';
import { log } from '../../config/logging.js';
import workoutPresetService from '../../services/workoutPresetService.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageWorkoutProgressionSchema,
  manageWorkoutProgressionInput,
  WORKOUT_PROGRESSION_ACTIONS,
  type ManageWorkoutProgressionInput,
} from './schemas/workoutProgression.js';
import { normalizeActionArgs } from './dates.js';
import {
  formatProgressionSettings,
  recommendProgression,
  type ProgressionRecommendation,
} from './workoutProgressionRecommend.js';

const VALID_ACTIONS = [...WORKOUT_PROGRESSION_ACTIONS];

interface PresetSetRow {
  reps?: number | null;
  set_type?: string | null;
}

interface PresetExerciseRow {
  id: number;
  exercise_id: string;
  exercise_name?: string | null;
  category?: string | null;
  modality?: string | null;
  equipment?: unknown;
  progression_mode?: string | null;
  rep_goal?: number | null;
  increment_type?: string | null;
  increment_value?: number | string | null;
  equipment_brand?: string | null;
  sets?: PresetSetRow[] | null;
}

interface WorkoutPresetRow {
  id: number;
  name: string;
  exercises?: PresetExerciseRow[] | null;
}

function recommendationFor(
  exercise: PresetExerciseRow
): ProgressionRecommendation {
  return recommendProgression({
    name: exercise.exercise_name ?? '',
    category: exercise.category,
    modality: exercise.modality,
    equipment: exercise.equipment,
    workingSets: exercise.sets ?? [],
  });
}

function formatExerciseProgression(
  exercise: PresetExerciseRow,
  recommended?: ProgressionRecommendation
): string {
  const current = formatProgressionSettings(exercise);
  const brand = exercise.equipment_brand
    ? ` · ${exercise.equipment_brand}`
    : '';
  let text = `**${exercise.exercise_name ?? 'Exercise'}**${brand}\n  now: ${current}\n  preset_exercise_id: ${exercise.id}`;
  if (recommended) {
    text += `\n  recommended: ${formatProgressionSettings(recommended)}\n  why: ${recommended.reason}`;
  }
  return text;
}

function formatProgressionChange(input: {
  progression_mode?: string | null;
  rep_goal?: number | null;
  increment_type?: string | null;
  increment_value?: number | string | null;
  equipment_brand?: string | null;
}): string {
  const brand = input.equipment_brand ? input.equipment_brand : 'no brand';
  return `${formatProgressionSettings(input)} · ${brand}`;
}

function filterExercises(
  exercises: PresetExerciseRow[],
  args: {
    exercise_id?: string;
    exercise_name?: string;
    preset_exercise_id?: number;
  }
): PresetExerciseRow[] {
  if (args.preset_exercise_id !== undefined) {
    return exercises.filter(
      (exercise) => exercise.id === args.preset_exercise_id
    );
  }
  if (args.exercise_id) {
    return exercises.filter(
      (exercise) => exercise.exercise_id === args.exercise_id
    );
  }
  if (args.exercise_name) {
    const needle = args.exercise_name.trim().toLowerCase();
    const exact = exercises.filter(
      (exercise) => (exercise.exercise_name ?? '').toLowerCase() === needle
    );
    if (exact.length > 0) return exact;
    return exercises.filter((exercise) =>
      (exercise.exercise_name ?? '').toLowerCase().includes(needle)
    );
  }
  return exercises;
}

async function resolvePreset(
  userId: string,
  presetId?: number,
  presetName?: string
): Promise<WorkoutPresetRow | string> {
  if (!presetId && !presetName) {
    return ERRORS.VALIDATION(
      'Either preset_id or preset_name must be provided'
    );
  }
  let id = presetId;
  if (!id && presetName) {
    const found = await workoutPresetRepository.getWorkoutPresetByName(
      userId,
      presetName
    );
    if (!found) {
      return ERRORS.NOT_FOUND('Workout preset', presetName);
    }
    id = found.id;
  }
  try {
    return (await workoutPresetService.getWorkoutPresetById(
      userId,
      id
    )) as WorkoutPresetRow;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return ERRORS.NOT_FOUND('Workout preset', String(id));
    }
    throw error;
  }
}

function explicitFields(
  args: Extract<ManageWorkoutProgressionInput, { action: 'update_progression' }>
): {
  progression_mode?: string;
  rep_goal?: number | null;
  increment_type?: string;
  increment_value?: number;
  equipment_brand?: string | null;
} | null {
  const fields: {
    progression_mode?: string;
    rep_goal?: number | null;
    increment_type?: string;
    increment_value?: number;
    equipment_brand?: string | null;
  } = {};
  if (args.progression_mode) fields.progression_mode = args.progression_mode;
  if (args.rep_goal !== undefined) fields.rep_goal = args.rep_goal;
  if (args.increment_type) fields.increment_type = args.increment_type;
  if (args.increment_value !== undefined)
    fields.increment_value = args.increment_value;
  if (args.equipment_brand !== undefined)
    fields.equipment_brand = args.equipment_brand;
  return Object.keys(fields).length > 0 ? fields : null;
}

export function buildWorkoutProgressionTools(userId: string, tz: string) {
  return {
    sparky_manage_workout_progression: tool({
      description: `Per-exercise workout progression (overload) settings on a saved preset.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Modes (from the in-app Progression & Overload Guide):
- rep_goal — Total Rep Goal. Best for machines, cables, dumbbells, accessories. Overload when combined reps across working sets hit the target.
- fixed — Fixed Target. Best for heavy barbell compounds. Every working set must hit the per-set target before the load moves.
- step_load — Step-Load (Reps Only). Best for bodyweight/calisthenics. Load stays fixed; the rep target steps up.
- manual — Manual (No Overload). Warmups, deloads, cardio, timed work.

Weights are stored in kg.

Actions:
- action: 'list_progression' (fields: preset_id?|preset_name?) — current mode/target/increment for every exercise. Omit the preset to list presets instead.
- action: 'recommend_progression' (fields: preset_id?|preset_name?, exercise_id?|exercise_name?|preset_exercise_id?) — recommended settings from the guide. Does not write anything.
- action: 'update_progression' (fields: preset_id?|preset_name?, confirmed, apply_recommendations?, exercise_id?|exercise_name?|preset_exercise_id?, progression_mode?, rep_goal?, increment_type?, increment_value?, equipment_brand?) — writes settings. apply_recommendations=true uses the same picks as recommend_progression. confirmed=true is required to apply; without it the tool returns a prompt and does not change anything. Get the user's go-ahead first.`,
      inputSchema: manageWorkoutProgressionInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_progression'
        );
        const parsed = manageWorkoutProgressionSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageWorkoutProgressionInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_progression': {
              if (!args.preset_id && !args.preset_name) {
                const { presets } =
                  await workoutPresetService.getWorkoutPresets(userId, 1, 1000);
                return formatList(
                  presets as WorkoutPresetRow[],
                  'Workout presets — pick one to inspect progression',
                  (preset) =>
                    `**${preset.name}** — ${preset.exercises?.length ?? 0} exercises\n  ID: ${preset.id}`
                );
              }
              const preset = await resolvePreset(
                userId,
                args.preset_id,
                args.preset_name
              );
              if (typeof preset === 'string') return preset;
              const exercises = preset.exercises ?? [];
              return formatList(
                exercises,
                `Progression: ${preset.name}`,
                (exercise) => formatExerciseProgression(exercise)
              );
            }

            case 'recommend_progression': {
              const preset = await resolvePreset(
                userId,
                args.preset_id,
                args.preset_name
              );
              if (typeof preset === 'string') return preset;
              const exercises = filterExercises(preset.exercises ?? [], args);
              if (exercises.length === 0) {
                return ERRORS.NOT_FOUND(
                  'Exercise in workout preset',
                  args.exercise_name ??
                    args.exercise_id ??
                    String(args.preset_exercise_id ?? 'unknown')
                );
              }
              return formatList(
                exercises,
                `Recommended progression: ${preset.name}`,
                (exercise) =>
                  formatExerciseProgression(
                    exercise,
                    recommendationFor(exercise)
                  )
              );
            }

            case 'update_progression': {
              const preset = await resolvePreset(
                userId,
                args.preset_id,
                args.preset_name
              );
              if (typeof preset === 'string') return preset;
              const targets = filterExercises(preset.exercises ?? [], args);
              if (targets.length === 0) {
                return ERRORS.NOT_FOUND(
                  'Exercise in workout preset',
                  args.exercise_name ??
                    args.exercise_id ??
                    String(args.preset_exercise_id ?? 'unknown')
                );
              }
              const fields = explicitFields(args);
              if (!args.apply_recommendations && !fields) {
                return ERRORS.VALIDATION(
                  'Provide apply_recommendations=true or at least one of progression_mode, rep_goal, increment_type, increment_value, equipment_brand'
                );
              }

              const planned = targets.map((exercise) => {
                const next = args.apply_recommendations
                  ? {
                      ...recommendationFor(exercise),
                      equipment_brand:
                        fields?.equipment_brand !== undefined
                          ? fields.equipment_brand
                          : exercise.equipment_brand,
                    }
                  : {
                      progression_mode:
                        fields!.progression_mode ??
                        exercise.progression_mode ??
                        'rep_goal',
                      rep_goal:
                        fields!.rep_goal !== undefined
                          ? fields!.rep_goal
                          : exercise.rep_goal,
                      increment_type:
                        fields!.increment_type ??
                        exercise.increment_type ??
                        'weight',
                      increment_value:
                        fields!.increment_value ??
                        (Number(exercise.increment_value) > 0
                          ? Number(exercise.increment_value)
                          : 2.5),
                      equipment_brand:
                        fields!.equipment_brand !== undefined
                          ? fields!.equipment_brand
                          : exercise.equipment_brand,
                      reason: 'Requested update.',
                    };
                return { exercise, next };
              });

              if (args.confirmed !== true) {
                const preview = planned
                  .map(
                    ({ exercise, next }) =>
                      `- ${exercise.exercise_name}: ${formatProgressionChange(exercise)} → ${formatProgressionChange(next)}`
                  )
                  .join('\n');
                return `Updating progression on preset ${preset.id} (${preset.name}) will change overload settings for ${planned.length} exercise${planned.length === 1 ? '' : 's'}:\n${preview}\nConfirm with the user first. If they agree, call update_progression again with the same fields and confirmed=true. Nothing was changed.`;
              }

              const rows =
                await workoutPresetService.updateWorkoutPresetExerciseProgressions(
                  userId,
                  preset.id,
                  planned.map(({ exercise, next }) => ({
                    match: { presetExerciseId: exercise.id },
                    fields: args.apply_recommendations
                      ? {
                          progression_mode: next.progression_mode,
                          rep_goal: next.rep_goal,
                          increment_type: next.increment_type,
                          increment_value: next.increment_value,
                          ...(fields?.equipment_brand !== undefined
                            ? { equipment_brand: fields.equipment_brand }
                            : {}),
                        }
                      : fields!,
                  }))
                );
              const updated = planned.map(({ exercise, next }, index) => {
                const row = rows[index] ?? next;
                return `${exercise.exercise_name}: ${formatProgressionChange(row)}`;
              });
              return formatConfirmation(
                `Updated progression on ${preset.name}:\n${updated.join('\n')}`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageWorkoutProgressionInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('Forbidden')) {
            return ERRORS.FORBIDDEN(
              'You do not have permission to update this workout preset.'
            );
          }
          if (message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Workout preset exercise',
              'preset_exercise_id' in args
                ? String(args.preset_exercise_id ?? args.exercise_id ?? '')
                : ''
            );
          }
          log('error', '[Workout Progression Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
