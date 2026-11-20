import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
import exerciseService from '../services/exerciseService.js';
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({
  default: {
    getExerciseById: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    createExerciseEntry: vi.fn(),
    getExerciseEntryById: vi.fn(),
    updateExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {},
}));
vi.mock('../models/userRepository', () => ({}));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {},
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
vi.mock('../integrations/wger/wgerService', () => ({}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({
  downloadImage: vi.fn(),
}));
vi.mock('../services/CalorieCalculationService', () => ({
  default: {
    estimateCaloriesBurnedPerHour: vi.fn(),
    prepareCalorieEstimator: vi.fn(),
  },
}));
vi.mock('../utils/uuidUtils', () => ({
  isValidUuid: vi.fn(),
  resolveExerciseIdToUuid: vi.fn(),
}));
vi.mock('../models/familyAccessRepository', () => ({
  checkFamilyAccessPermission: vi.fn(),
}));
vi.mock('../services/exerciseEntryHistoryService', () => ({
  getGroupedExerciseSessionById: vi.fn(),
  getGroupedExerciseSessionByIdWithClient: vi.fn(),
}));

const exerciseId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const data = {
  id: entryId,
  exercise_id: exerciseId,
  entry_date: '2026-10-15',
  duration_minutes: 30,
};

describe('createOrReplayExerciseEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveExerciseIdToUuid).mockResolvedValue(exerciseId);
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseDb.getExerciseById.mockResolvedValue({
      id: exerciseId,
      name: 'Running',
      calories_per_hour: 600,
    });
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(null);
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockResolvedValue({
      id: entryId,
      user_id: 'user-1',
    });
  });

  it('creates the entry with the client id when it is new', async () => {
    const result = await exerciseService.createOrReplayExerciseEntry(
      'user-1',
      'user-1',
      data
    );
    expect(result.replayed).toBe(false);
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
    const [, entryData] = vi.mocked(exerciseEntryDb.createExerciseEntry).mock
      .calls[0];
    expect(entryData.id).toBe(entryId);
  });

  it('returns the stored entry without creating another for a repeat', async () => {
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue({
      id: entryId,
      user_id: 'user-1',
    });
    const result = await exerciseService.createOrReplayExerciseEntry(
      'user-1',
      'user-1',
      data
    );
    expect(result).toEqual({
      entry: { id: entryId, user_id: 'user-1' },
      replayed: true,
    });
    expect(exerciseEntryDb.createExerciseEntry).not.toHaveBeenCalled();
  });

  it('treats a visible entry of someone else as taken, not as a repeat', async () => {
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue({
      id: entryId,
      user_id: 'someone-else',
    });
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'exercise_entries_pkey',
      })
    );
    await expect(
      exerciseService.createOrReplayExerciseEntry('user-1', 'user-1', data)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns the winner of a race between two copies of one create', async () => {
    vi.mocked(exerciseEntryDb.getExerciseEntryById)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: entryId, user_id: 'user-1' });
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'exercise_entries_pkey',
      })
    );
    const result = await exerciseService.createOrReplayExerciseEntry(
      'user-1',
      'user-1',
      data
    );
    expect(result.replayed).toBe(true);
  });

  it('refuses an id taken by an entry this user cannot see', async () => {
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'exercise_entries_pkey',
      })
    );
    await expect(
      exerciseService.createOrReplayExerciseEntry('user-1', 'user-1', data)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('does not look anything up when the data has no id', async () => {
    const { id: _id, ...withoutId } = data;
    const result = await exerciseService.createOrReplayExerciseEntry(
      'user-1',
      'user-1',
      withoutId
    );
    expect(result.replayed).toBe(false);
    expect(exerciseEntryDb.getExerciseEntryById).not.toHaveBeenCalled();
  });
});
