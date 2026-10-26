import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workoutSplitService.js', () => {
  class UnknownWorkoutSplitError extends Error {}
  class WorkoutSplitExercisesUnavailableError extends Error {
    missingExerciseIds: string[];
    constructor(ids: string[]) {
      super('Some exercises could not be added from the exercise database.');
      this.missingExerciseIds = ids;
    }
  }
  return {
    importWorkoutSplit: vi.fn(),
    UnknownWorkoutSplitError,
    WorkoutSplitExercisesUnavailableError,
  };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { WORKOUT_SPLITS } from '@workspace/shared';
import {
  importWorkoutSplit,
  WorkoutSplitExercisesUnavailableError,
} from '../services/workoutSplitService.js';
import { buildWorkoutSplitTools } from '../ai/tools/workoutSplitTools.js';
import { isToolCallAllowedReadOnly } from '../ai/mcp/toolAccess.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const tool = buildWorkoutSplitTools(
  'user-1',
  'UTC'
).sparky_manage_workout_splits;
const run = (args: Record<string, unknown>) =>
  (tool.execute as (a: unknown, o: unknown) => Promise<string>)(args, toolOpts);

beforeEach(() => vi.clearAllMocks());

describe('sparky_manage_workout_splits', () => {
  it('lists every program by default', async () => {
    const text = await run({ action: 'list_workout_splits' });
    expect(text).toContain(`Workout programs (${WORKOUT_SPLITS.length})`);
    expect(text).toContain('linear_5x5');
  });

  it('filters by venue, also listing the smaller ones', async () => {
    const home = await run({ action: 'list_workout_splits', venue: 'home' });
    expect(home).toContain('full_body_3_home');
    expect(home).not.toContain('body_part_5');

    const garage = await run({
      action: 'list_workout_splits',
      venue: 'garage',
    });
    expect(garage).toContain('linear_5x5');
    expect(garage).toContain('push_pull_legs_3_home');
  });

  it('says so when nothing matches', async () => {
    expect(
      await run({
        action: 'list_workout_splits',
        venue: 'home',
        goal: 'strength',
      })
    ).toContain('No program matches');
  });

  it('shows the sessions, targets and progression of one program', async () => {
    const text = await run({
      action: 'get_workout_split',
      split_id: 'linear_5x5',
    });
    expect(text).toContain('## Workout a');
    expect(text).toContain('Barbell Squat: 5 x 5 (adds 5 kg each session)');
    expect(text).toContain('Standing Military Press: 5 x 5');
  });

  it('describes a timed hold in seconds', async () => {
    const text = await run({
      action: 'get_workout_split',
      split_id: 'full_body_3_garage',
    });
    expect(text).toContain('Plank: 3 x 30 s hold');
  });

  it('reports an unknown program', async () => {
    expect(
      await run({ action: 'get_workout_split', split_id: 'nope' })
    ).toContain('nope');
  });

  it('asks for confirmation before adding and changes nothing', async () => {
    const text = await run({
      action: 'import_workout_split',
      split_id: 'linear_5x5',
    });
    expect(text).toContain('Confirm with the user first');
    expect(text).toContain('check with a doctor');
    expect(text).toContain('without making it their active plan');
    expect(importWorkoutSplit).not.toHaveBeenCalled();
  });

  it('adds the program once confirmed, with readable names', async () => {
    vi.mocked(importWorkoutSplit).mockResolvedValue({
      planId: 7,
      presetIds: { workout_a: 1, workout_b: 2 },
      addedExerciseCount: 5,
    });

    const text = await run({
      action: 'import_workout_split',
      split_id: 'linear_5x5',
      plan_name: 'My 5x5',
      activate: true,
      confirmed: true,
    });

    expect(importWorkoutSplit).toHaveBeenCalledWith('user-1', 'linear_5x5', {
      planName: 'My 5x5',
      sessionNames: { workout_a: 'Workout a', workout_b: 'Workout b' },
      activate: true,
    });
    expect(text).toContain('Added "My 5x5"');
    expect(text).toContain('now the active plan');
  });

  it('names the exercises that could not be added', async () => {
    vi.mocked(importWorkoutSplit).mockRejectedValue(
      new WorkoutSplitExercisesUnavailableError(['Barbell_Squat'])
    );
    const text = await run({
      action: 'import_workout_split',
      split_id: 'linear_5x5',
      confirmed: true,
    });
    expect(text).toContain('Nothing was added');
    expect(text).toContain('Barbell_Squat');
  });

  it('is read-only over MCP except for adding a program', () => {
    const allowed = (action: string) =>
      isToolCallAllowedReadOnly('sparky_manage_workout_splits', { action });
    expect(allowed('list_workout_splits')).toBe(true);
    expect(allowed('get_workout_split')).toBe(true);
    expect(allowed('import_workout_split')).toBe(false);
  });
});
