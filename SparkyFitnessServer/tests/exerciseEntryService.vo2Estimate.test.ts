import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import { setExerciseEntryVo2Estimate } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: { getExerciseEntryOwnerId: vi.fn() },
}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../models/userRepository', () => ({ default: {} }));
vi.mock('../models/workoutTelemetryRepository', () => ({}));

const userId = 'user-1';
const entryId = 'entry-1';
const client = { query: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(client as never);
  client.query.mockResolvedValue({ rows: [] });
  vi.mocked(exerciseEntryRepository.getExerciseEntryOwnerId).mockResolvedValue(
    userId
  );
});

describe('setExerciseEntryVo2Estimate', () => {
  it('sets the flag on this entry only, as the acting user', async () => {
    await setExerciseEntryVo2Estimate(userId, 'actor-1', entryId, {
      excluded: true,
    });

    expect(getClient).toHaveBeenCalledWith(userId, 'actor-1');
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(String(sql)).toContain('exclude_from_vo2_estimate = $2');
    expect(String(sql)).not.toContain('exercise_preset_entry_id');
    expect(params).toEqual([entryId, true, userId]);
    expect(client.release).toHaveBeenCalled();
  });

  it('puts a run back', async () => {
    await setExerciseEntryVo2Estimate(userId, 'actor-1', entryId, {
      excluded: false,
    });
    expect(client.query.mock.calls[0][1]).toEqual([entryId, false, userId]);
  });

  it("refuses an entry that is not the caller's, writing nothing", async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue('someone-else');

    await expect(
      setExerciseEntryVo2Estimate(userId, 'actor-1', entryId, {
        excluded: true,
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(client.query).not.toHaveBeenCalled();
  });
});
