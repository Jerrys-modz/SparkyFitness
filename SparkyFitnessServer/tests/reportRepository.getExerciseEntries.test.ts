import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { getClient } from '../db/poolManager.js';
import { getExerciseEntries } from '../models/reportRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

const TEST_USER_ID = '00000000-0000-4000-a000-000000000001';

describe('reportRepository.getExerciseEntries — format selection and preset joins', () => {
  let mockClient: MockDbClient;

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  it('selects COALESCE(wp.workout_format, standard) and LEFT JOINs exercise_preset_entries and workout_presets', async () => {
    await getExerciseEntries(
      TEST_USER_ID,
      '2026-09-01',
      '2026-09-30',
      'barbell',
      'chest',
      'Bench Press'
    );

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const sql = String(mockClient.query.mock.calls[0][0]);
    const params = mockClient.query.mock.calls[0][1];

    expect(sql).toContain(
      "COALESCE(wp.workout_format, 'standard') AS workout_format"
    );
    expect(sql).toContain(
      'LEFT JOIN exercise_preset_entries epe ON ee.exercise_preset_entry_id = epe.id'
    );
    expect(sql).toContain(
      'LEFT JOIN workout_presets wp ON epe.workout_preset_id = wp.id'
    );
    expect(params).toEqual([
      TEST_USER_ID,
      '2026-09-01',
      '2026-09-30',
      '%barbell%',
      '%chest%',
      'Bench Press',
    ]);
  });
});
