import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// `add_exercise_water_to_goal` only ever bumps the daily water goal by
// SUM(water_estimated) for the day. Garmin syncs populate that column from
// their own measured value, but nothing populated it for manually logged
// (or otherwise non-Garmin) exercise, so the goal adjustment silently did
// nothing for most users. These tests pin down the calorie-based fallback
// that fills the gap on creation, without disturbing a source-provided or
// explicitly-supplied value.
describe('createExerciseEntry estimates water loss when none is provided', () => {
  const exerciseSnapshot = {
    name: 'Running',
    calories_per_hour: 600,
    category: 'cardio',
    source: 'nutritionix',
    source_id: 'ex-source-1',
    force: null,
    level: null,
    mechanic: null,
    equipment: null,
    primary_muscles: null,
    secondary_muscles: null,
    instructions: null,
    images: null,
    modality: 'duration_distance',
  };

  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      // No existing entry to deduplicate against.
      if (/SELECT id FROM exercise_entries/i.test(sql)) return { rows: [] };
      if (/SELECT .* FROM exercises WHERE id/i.test(sql)) {
        return { rows: [exerciseSnapshot] };
      }
      // The INSERT ... RETURNING id
      return { rows: [{ id: 'new-entry-1' }] };
    });
  });

  // Reads the value bound to `water_estimated` out of the INSERT actually
  // executed, by locating the column in the query text rather than assuming
  // a fixed position -- robust to the column list being reordered.
  const writtenWaterEstimated = () => {
    const insertCall = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && /INSERT INTO exercise_entries/i.test(c[0])
    );
    expect(insertCall, 'expected the main INSERT to have run').toBeDefined();
    const [sql, params] = insertCall as [string, unknown[]];
    const columnList = sql
      .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
      .split(',')
      .map((c) => c.trim());
    const index = columnList.indexOf('water_estimated');
    expect(
      index,
      'expected water_estimated in the column list'
    ).toBeGreaterThanOrEqual(0);
    return params[index];
  };

  it('estimates water loss from calories burned when nothing else provides one', async () => {
    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      {
        exercise_id: 'ex-1',
        entry_date: '2026-08-01',
        duration_minutes: 45,
        calories_burned: 400,
      },
      'user-1',
      'Manual'
    );

    expect(writtenWaterEstimated()).toBe(400);
  });

  it('keeps a device-provided value instead of recomputing it', async () => {
    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      {
        exercise_id: 'ex-1',
        entry_date: '2026-08-01',
        duration_minutes: 45,
        calories_burned: 400,
        water_estimated: 550,
      },
      'user-1',
      'garmin'
    );

    expect(writtenWaterEstimated()).toBe(550);
  });

  it('leaves it null when there are no calories to estimate from', async () => {
    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      {
        exercise_id: 'ex-1',
        entry_date: '2026-08-01',
        duration_minutes: 10,
        calories_burned: 0,
      },
      'user-1',
      'Manual'
    );

    expect(writtenWaterEstimated()).toBeNull();
  });
});
