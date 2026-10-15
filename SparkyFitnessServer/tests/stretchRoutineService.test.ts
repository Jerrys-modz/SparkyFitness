import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getStretchRoutine } from '@workspace/shared';
import stretchRoutineService from '../services/stretchRoutineService.js';
import exerciseDb from '../models/exercise.js';
import workoutPresetService from '../services/workoutPresetService.js';

vi.mock('../models/exercise', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../services/workoutPresetService', () => ({
  default: { createWorkoutPreset: vi.fn() },
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';

describe('stretchRoutineService.addStarterRoutine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseDb.getExerciseBySourceAndSourceId).mockResolvedValue(
      null
    );
    vi.mocked(exerciseDb.createExercise).mockImplementation(
      async (data: { source_id: string }) => ({ id: `ex-${data.source_id}` })
    );
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 1,
    });
  });

  it('returns null for an unknown routine', async () => {
    expect(
      await stretchRoutineService.addStarterRoutine(USER_ID, 'nope')
    ).toBeNull();
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('creates duration exercises and a preset with one set per side', async () => {
    await stretchRoutineService.addStarterRoutine(USER_ID, 'desk-reset');
    const routine = getStretchRoutine('desk-reset')!;

    expect(exerciseDb.createExercise).toHaveBeenCalledTimes(
      routine.moves.length
    );
    expect(exerciseDb.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ modality: 'duration', category: 'stretching' })
    );
    const [, payload] = vi.mocked(workoutPresetService.createWorkoutPreset).mock
      .calls[0];
    expect(payload.exercises).toHaveLength(routine.moves.length);
    routine.moves.forEach((move, i) => {
      expect(payload.exercises[i].sets).toHaveLength(move.perSide ? 2 : 1);
      expect(payload.exercises[i].sets[0].duration).toBe(move.holdSeconds);
    });
  });

  it('reuses exercises the user already has', async () => {
    vi.mocked(exerciseDb.getExerciseBySourceAndSourceId).mockResolvedValue({
      id: 'existing',
    });
    await stretchRoutineService.addStarterRoutine(USER_ID, 'post-run');
    expect(exerciseDb.createExercise).not.toHaveBeenCalled();
  });
});
