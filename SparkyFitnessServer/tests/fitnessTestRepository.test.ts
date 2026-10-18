import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFitnessTest,
  deleteFitnessTest,
  getLatestFitnessTest,
  InvalidFitnessTestError,
  listFitnessTests,
  UnknownExerciseEntryError,
} from '../models/fitnessTestRepository.js';
import { getClient } from '../db/poolManager.js';
import { evaluateFitnessTest } from '@workspace/shared';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const entryId = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';

const body = {
  test_type: '5k' as const,
  test_date: '2026-10-18',
  distance_meters: 5000,
  duration_seconds: 1500,
};
const paces = evaluateFitnessTest({
  type: '5k',
  distanceMeters: 5000,
  durationSeconds: 1500,
})!.paces;
const row = {
  id: entryId,
  test_type: '5k',
  test_day: '2026-10-18',
  distance_meters: '5000.0',
  duration_seconds: 1500,
  split_distance_meters: null,
  result_value: '1500.0',
  exercise_entry_id: null,
  paces,
  created_at: '2026-10-18T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('fitness test repository', () => {
  it('works the result and paces out on the server and saves them', async () => {
    query.mockResolvedValue({ rows: [row] });
    const saved = await createFitnessTest('u1', body, 'u1');
    expect(saved.result_value).toBe(1500);
    expect(saved.test_date).toBe('2026-10-18');
    const [sql, values] = query.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO fitness_tests');
    expect(String(sql)).not.toContain('ON CONFLICT');
    expect(values[7]).toBe(1500);
    expect(values[8]).toBe(paces.thresholdSecondsPerKm);
    expect(JSON.parse(values[10])).toEqual(JSON.parse(JSON.stringify(paces)));
    expect(getClient).toHaveBeenCalledWith('u1', 'u1');
    expect(release).toHaveBeenCalled();
  });

  it('refuses measurements that make no believable test, writing nothing', async () => {
    await expect(
      createFitnessTest('u1', { ...body, duration_seconds: 60 })
    ).rejects.toBeInstanceOf(InvalidFitnessTestError);
    expect(query).not.toHaveBeenCalled();
  });

  it('replaces the test of an activity that already has one', async () => {
    query.mockImplementation(async (sql: string) =>
      String(sql).startsWith('SELECT 1')
        ? { rows: [{ '?column?': 1 }], rowCount: 1 }
        : { rows: [{ ...row, exercise_entry_id: entryId }] }
    );
    const saved = await createFitnessTest('u1', {
      ...body,
      exercise_entry_id: entryId,
    });
    expect(saved.exercise_entry_id).toBe(entryId);
    expect(String(query.mock.calls[1][0])).toContain(
      'ON CONFLICT (exercise_entry_id)'
    );
  });

  it("refuses an activity that is not the person's", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      createFitnessTest('u1', { ...body, exercise_entry_id: entryId })
    ).rejects.toBeInstanceOf(UnknownExerciseEntryError);
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalled();
  });

  it('lists newest first, capped, and skips rows it cannot read', async () => {
    query.mockResolvedValue({ rows: [row, { ...row, paces: { bad: true } }] });
    const tests = await listFitnessTests('u1', 'u1', 500);
    expect(tests).toHaveLength(1);
    expect(String(query.mock.calls[0][0])).toContain(
      'ORDER BY test_date DESC, created_at DESC'
    );
    expect(query.mock.calls[0][1]).toEqual(['u1', 50]);
  });

  it('reads the latest, or null', async () => {
    query.mockResolvedValueOnce({ rows: [row] });
    expect((await getLatestFitnessTest('u1', 'u1'))?.id).toBe(entryId);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getLatestFitnessTest('u1', 'u1')).toBeNull();
  });

  it('deletes only the persons own test', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteFitnessTest('u1', entryId)).toBe(true);
    expect(query.mock.calls[0][1]).toEqual([entryId, 'u1']);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteFitnessTest('u1', entryId)).toBe(false);
  });
});
