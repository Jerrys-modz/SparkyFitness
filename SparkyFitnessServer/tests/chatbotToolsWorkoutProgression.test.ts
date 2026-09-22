import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workoutPresetService.js', () => ({
  default: {
    getWorkoutPresets: vi.fn(),
    getWorkoutPresetById: vi.fn(),
    updateWorkoutPresetExerciseProgressions: vi.fn(),
  },
}));

vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import workoutPresetService from '../services/workoutPresetService.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { buildWorkoutProgressionTools } from '../ai/tools/workoutProgressionTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const opts = toolOpts;

const PRESET_ID = 7;
const BENCH_ID = '11111111-1111-4111-8111-111111111111';
const FLY_ID = '22222222-2222-4222-8222-222222222222';

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = workoutPresetService as unknown as {
  getWorkoutPresets: ReturnType<typeof vi.fn>;
  getWorkoutPresetById: ReturnType<typeof vi.fn>;
  updateWorkoutPresetExerciseProgressions: ReturnType<typeof vi.fn>;
};

const repo = workoutPresetRepository as unknown as {
  getWorkoutPresetByName: ReturnType<typeof vi.fn>;
};

const PRESET = {
  id: PRESET_ID,
  name: 'Push Day',
  exercises: [
    {
      id: 101,
      exercise_id: BENCH_ID,
      exercise_name: 'Barbell Bench Press',
      category: 'Chest',
      modality: 'reps',
      equipment: ['Barbell'],
      progression_mode: 'rep_goal',
      rep_goal: 24,
      increment_type: 'weight',
      increment_value: 5,
      equipment_brand: null,
      sets: [
        { reps: 8, set_type: 'Working Set' },
        { reps: 8, set_type: 'Working Set' },
        { reps: 8, set_type: 'Working Set' },
      ],
    },
    {
      id: 102,
      exercise_id: FLY_ID,
      exercise_name: 'Cable Fly',
      category: 'Chest',
      modality: 'reps',
      equipment: ['Cable'],
      progression_mode: 'rep_goal',
      rep_goal: 24,
      increment_type: 'weight',
      increment_value: 5,
      equipment_brand: 'LifeFitness',
      sets: [
        { reps: 12, set_type: 'Working Set' },
        { reps: 10, set_type: 'Working Set' },
        { reps: 8, set_type: 'Working Set' },
      ],
    },
  ],
};

function getTool() {
  const tools = buildWorkoutProgressionTools('user-1', 'UTC');
  return tools.sparky_manage_workout_progression;
}

describe('sparky_manage_workout_progression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getWorkoutPresetById.mockResolvedValue(PRESET);
  });

  it('lists workout presets when no preset is given (inferred from {})', async () => {
    svc.getWorkoutPresets.mockResolvedValue({
      presets: [
        { id: PRESET_ID, name: 'Push Day', exercises: [{}, {}, {}, {}] },
        { id: 8, name: 'Pull Day', exercises: [{}, {}] },
      ],
    });
    const result = await getTool().execute!({}, opts);
    expect(result).toBe(
      '# Workout presets — pick one to inspect progression\n\n' +
        '**Push Day** — 4 exercises\n  ID: 7\n\n' +
        '**Pull Day** — 2 exercises\n  ID: 8'
    );
    expect(svc.getWorkoutPresetById).not.toHaveBeenCalled();
  });

  it('lists current progression for a preset', async () => {
    const result = await getTool().execute!(
      { action: 'list_progression', preset_id: PRESET_ID },
      opts
    );
    expect(result).toBe(
      '# Progression: Push Day\n\n' +
        '**Barbell Bench Press**\n  now: Total Rep Goal · 24 total reps · +5 kg\n  preset_exercise_id: 101\n\n' +
        '**Cable Fly** · LifeFitness\n  now: Total Rep Goal · 24 total reps · +5 kg\n  preset_exercise_id: 102'
    );
    expect(svc.getWorkoutPresetById).toHaveBeenCalledWith('user-1', PRESET_ID);
  });

  it('resolves a preset by name', async () => {
    repo.getWorkoutPresetByName.mockResolvedValue({ id: PRESET_ID });
    const result = await getTool().execute!(
      { action: 'list_progression', preset_name: 'Push Day' },
      opts
    );
    expect(String(result)).toContain('# Progression: Push Day');
    expect(repo.getWorkoutPresetByName).toHaveBeenCalledWith(
      'user-1',
      'Push Day'
    );
    expect(svc.getWorkoutPresetById).toHaveBeenCalledWith('user-1', PRESET_ID);
  });

  it('recommends settings from the in-app guide', async () => {
    const result = await getTool().execute!(
      { action: 'recommend_progression', preset_id: PRESET_ID },
      opts
    );
    expect(result).toBe(
      '# Recommended progression: Push Day\n\n' +
        '**Barbell Bench Press**\n  now: Total Rep Goal · 24 total reps · +5 kg\n  preset_exercise_id: 101\n  recommended: Fixed Target · 8 reps/set · +2.5 kg\n  why: Heavy barbell compounds do best when every working set has to hit the target before the load moves.\n\n' +
        '**Cable Fly** · LifeFitness\n  now: Total Rep Goal · 24 total reps · +5 kg\n  preset_exercise_id: 102\n  recommended: Total Rep Goal · 30 total reps · +2.5 kg\n  why: Total Rep Goal fits machines, cables, dumbbells and accessories — 3 working sets aiming for 30 reps combined, then a small load bump.'
    );
  });

  it('filters recommend_progression by exercise name', async () => {
    const result = await getTool().execute!(
      {
        action: 'recommend_progression',
        preset_id: PRESET_ID,
        exercise_name: 'bench',
      },
      opts
    );
    expect(String(result)).toContain('**Barbell Bench Press**');
    expect(String(result)).not.toContain('**Cable Fly**');
  });

  it('does not write without confirmed=true', async () => {
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        preset_exercise_id: 101,
        apply_recommendations: true,
      },
      opts
    );
    expect(result).toBe(
      'Updating progression on preset 7 (Push Day) will change overload settings for 1 exercise:\n' +
        '- Barbell Bench Press: Total Rep Goal · 24 total reps · +5 kg · no brand → Fixed Target · 8 reps/set · +2.5 kg · no brand\n' +
        'Confirm with the user first. If they agree, call update_progression again with the same fields and confirmed=true. Nothing was changed.'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).not.toHaveBeenCalled();
  });

  it('writes recommended settings when confirmed', async () => {
    svc.updateWorkoutPresetExerciseProgressions.mockResolvedValue([
      {
        progression_mode: 'fixed',
        rep_goal: 8,
        increment_type: 'weight',
        increment_value: 2.5,
        equipment_brand: null,
      },
    ]);
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        preset_exercise_id: 101,
        apply_recommendations: true,
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      '✅ Updated progression on Push Day:\nBarbell Bench Press: Fixed Target · 8 reps/set · +2.5 kg · no brand'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledTimes(
      1
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      [
        {
          match: { presetExerciseId: 101 },
          fields: {
            progression_mode: 'fixed',
            rep_goal: 8,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        },
      ]
    );
  });

  it('writes explicit fields when confirmed', async () => {
    svc.updateWorkoutPresetExerciseProgressions.mockResolvedValue([
      {
        progression_mode: 'step_load',
        rep_goal: 40,
        increment_type: 'reps',
        increment_value: 3,
        equipment_brand: 'LifeFitness',
      },
    ]);
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        exercise_name: 'Cable Fly',
        progression_mode: 'step_load',
        rep_goal: 40,
        increment_type: 'reps',
        increment_value: 3,
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      '✅ Updated progression on Push Day:\nCable Fly: Step-Load (Reps Only) · 40 total reps · +3 reps · LifeFitness'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      [
        {
          match: { presetExerciseId: 102 },
          fields: {
            progression_mode: 'step_load',
            rep_goal: 40,
            increment_type: 'reps',
            increment_value: 3,
          },
        },
      ]
    );
  });

  it('shows an equipment-brand-only change in the confirmation preview', async () => {
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        preset_exercise_id: 102,
        equipment_brand: 'Hammer Strength',
      },
      opts
    );
    expect(result).toBe(
      'Updating progression on preset 7 (Push Day) will change overload settings for 1 exercise:\n' +
        '- Cable Fly: Total Rep Goal · 24 total reps · +5 kg · LifeFitness → Total Rep Goal · 24 total reps · +5 kg · Hammer Strength\n' +
        'Confirm with the user first. If they agree, call update_progression again with the same fields and confirmed=true. Nothing was changed.'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).not.toHaveBeenCalled();
  });

  it('overlays an explicit equipment brand when applying recommendations', async () => {
    const preview = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        preset_exercise_id: 101,
        apply_recommendations: true,
        equipment_brand: 'Rogue',
      },
      opts
    );
    expect(preview).toBe(
      'Updating progression on preset 7 (Push Day) will change overload settings for 1 exercise:\n' +
        '- Barbell Bench Press: Total Rep Goal · 24 total reps · +5 kg · no brand → Fixed Target · 8 reps/set · +2.5 kg · Rogue\n' +
        'Confirm with the user first. If they agree, call update_progression again with the same fields and confirmed=true. Nothing was changed.'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).not.toHaveBeenCalled();

    svc.updateWorkoutPresetExerciseProgressions.mockResolvedValue([
      {
        progression_mode: 'fixed',
        rep_goal: 8,
        increment_type: 'weight',
        increment_value: 2.5,
        equipment_brand: 'Rogue',
      },
    ]);
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        preset_exercise_id: 101,
        apply_recommendations: true,
        equipment_brand: 'Rogue',
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      '✅ Updated progression on Push Day:\nBarbell Bench Press: Fixed Target · 8 reps/set · +2.5 kg · Rogue'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      [
        {
          match: { presetExerciseId: 101 },
          fields: {
            progression_mode: 'fixed',
            rep_goal: 8,
            increment_type: 'weight',
            increment_value: 2.5,
            equipment_brand: 'Rogue',
          },
        },
      ]
    );
  });

  it('applies a whole-preset update in one service call', async () => {
    svc.updateWorkoutPresetExerciseProgressions.mockResolvedValue([
      {
        progression_mode: 'fixed',
        rep_goal: 8,
        increment_type: 'weight',
        increment_value: 2.5,
        equipment_brand: null,
      },
      {
        progression_mode: 'rep_goal',
        rep_goal: 30,
        increment_type: 'weight',
        increment_value: 2.5,
        equipment_brand: 'LifeFitness',
      },
    ]);
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        apply_recommendations: true,
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      '✅ Updated progression on Push Day:\n' +
        'Barbell Bench Press: Fixed Target · 8 reps/set · +2.5 kg · no brand\n' +
        'Cable Fly: Total Rep Goal · 30 total reps · +2.5 kg · LifeFitness'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledTimes(
      1
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      [
        {
          match: { presetExerciseId: 101 },
          fields: {
            progression_mode: 'fixed',
            rep_goal: 8,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        },
        {
          match: { presetExerciseId: 102 },
          fields: {
            progression_mode: 'rep_goal',
            rep_goal: 30,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        },
      ]
    );
  });

  it('rejects an update with neither recommendations nor fields', async () => {
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Provide apply_recommendations=true or at least one of progression_mode, rep_goal, increment_type, increment_value, equipment_brand'
    );
    expect(svc.updateWorkoutPresetExerciseProgressions).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing preset', async () => {
    svc.getWorkoutPresetById.mockRejectedValue(
      new Error('Workout preset not found.')
    );
    const result = await getTool().execute!(
      { action: 'list_progression', preset_id: 99 },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Workout preset with ID '99' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('returns NOT_FOUND for a missing exercise in the preset', async () => {
    const result = await getTool().execute!(
      {
        action: 'recommend_progression',
        preset_id: PRESET_ID,
        exercise_name: 'Deadlift',
      },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Exercise in workout preset with ID 'Deadlift' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('returns FORBIDDEN when the caller does not own the preset', async () => {
    svc.updateWorkoutPresetExerciseProgressions.mockRejectedValue(
      new Error(
        'Forbidden: You do not have permission to update this workout preset.'
      )
    );
    const result = await getTool().execute!(
      {
        action: 'update_progression',
        preset_id: PRESET_ID,
        apply_recommendations: true,
        confirmed: true,
      },
      opts
    );
    expect(result).toBe(
      'Error [FORBIDDEN]: You do not have permission to update this workout preset.'
    );
  });

  it('returns VALIDATION when recommend_progression has no preset', async () => {
    const result = await getTool().execute!(
      { action: 'recommend_progression' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either preset_id or preset_name must be provided'
    );
  });

  it('returns DB_ERROR when the service throws a generic error', async () => {
    svc.getWorkoutPresets.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!(
      { action: 'list_progression' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
