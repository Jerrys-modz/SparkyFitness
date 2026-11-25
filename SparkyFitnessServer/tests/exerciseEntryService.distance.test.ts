import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import { setExerciseEntryDistance } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryOwnerId: vi.fn(),
    getExerciseEntryById: vi.fn(),
    _updateExerciseEntryTelemetryOnlyWithClient: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../models/userRepository', () => ({ default: {} }));
vi.mock('../models/workoutTelemetryRepository', () => ({}));

const userId = 'user-1';
const entryId = 'entry-1';
const client = { query: vi.fn(), release: vi.fn() };
// What the row lock inside the transaction reads.
let lockedDistance: string | null;
const answer = async (sql: string) =>
  sql.includes('FOR NO KEY UPDATE')
    ? { rows: [{ distance: lockedDistance }] }
    : { rows: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(client as never);
  lockedDistance = '4';
  client.query.mockImplementation(answer);
  vi.mocked(exerciseEntryRepository.getExerciseEntryOwnerId).mockResolvedValue(
    userId
  );
  vi.mocked(exerciseEntryRepository.getExerciseEntryById).mockResolvedValue({
    id: entryId,
    entry_date: '2026-10-06',
    // Stale: a correction committed after this read and before the lock.
    distance: '3',
  });
});

const sqlOf = () => client.query.mock.calls.map((call) => String(call[0]));

describe('setExerciseEntryDistance', () => {
  it('updates the entry, its set and scales the laps by the same factor, in one transaction', async () => {
    await setExerciseEntryDistance(userId, 'actor-1', entryId, {
      distance_km: 5,
    });
    const sql = sqlOf();
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(
      sql.some((s) => s.includes('UPDATE exercise_entries SET distance'))
    ).toBe(true);
    expect(
      sql.some((s) => s.includes('UPDATE exercise_entry_sets SET distance'))
    ).toBe(true);
    const laps = client.query.mock.calls.find((call) =>
      String(call[0]).includes('UPDATE exercise_entry_laps')
    );
    // 5 km entered over the 4 km the locked row holds, not the 3 km read
    // before the transaction.
    expect(laps?.[1]).toEqual([entryId, 1.25]);
    expect(client.release).toHaveBeenCalled();
  });

  it('leaves the laps alone when the entry had no distance to scale from', async () => {
    lockedDistance = null;
    await setExerciseEntryDistance(userId, 'actor-1', entryId, {
      distance_km: 5,
    });
    expect(sqlOf().some((s) => s.includes('exercise_entry_laps'))).toBe(false);
  });

  it('answers 404 and rolls back when the entry is deleted before the lock', async () => {
    client.query.mockImplementation(async () => ({ rows: [] }));
    await expect(
      setExerciseEntryDistance(userId, 'actor-1', entryId, { distance_km: 5 })
    ).rejects.toMatchObject({ status: 404 });
    const sql = sqlOf();
    expect(sql).toContain('ROLLBACK');
    expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses an entry that has a GPS track and rolls back', async () => {
    client.query.mockImplementation(async (sql: string) =>
      sql.includes('exercise_entry_gps_points')
        ? { rows: [{ '?column?': 1 }] }
        : answer(sql)
    );
    await expect(
      setExerciseEntryDistance(userId, 'actor-1', entryId, { distance_km: 5 })
    ).rejects.toMatchObject({ status: 409 });
    const sql = sqlOf();
    expect(sql).toContain('ROLLBACK');
    expect(sql.some((s) => s.includes('UPDATE exercise_entries'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("does not touch an entry that is not the caller's", async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue('someone-else');
    await expect(
      setExerciseEntryDistance(userId, 'actor-1', entryId, { distance_km: 5 })
    ).rejects.toMatchObject({ status: 404 });
    expect(getClient).not.toHaveBeenCalled();
  });

  describe('with a belt speed for the run block', () => {
    const MPH = 0.44704;
    const belt = 5 * MPH;
    // 5 min of slow walking, 20 of running, 5 of walking, a row every 12 s.
    const points: [number, number][] = [];
    (() => {
      let t = 0;
      let m = 0;
      for (const [seconds, speed] of [
        [300, 0.97],
        [1200, belt * 1.067],
        [300, 0.97],
      ] as const) {
        for (let e = 0; e < seconds; e += 12) {
          t += 12;
          m += 12 * speed;
          points.push([t, Math.round(m * 100) / 100]);
        }
      }
    })();
    const seriesAnswer = async (sql: string) =>
      sql.includes('SELECT points FROM exercise_entry_distance_series')
        ? { rows: [{ points }] }
        : answer(sql);

    it('writes a series where the run block keeps its belt distance', async () => {
      client.query.mockImplementation(seriesAnswer);
      const total = belt * 1200 + 2.7 * MPH * 600;
      await setExerciseEntryDistance(userId, 'actor-1', entryId, {
        distance_km: total / 1000,
        belt_speed_mps: belt,
      });
      const write = client.query.mock.calls.find((call) =>
        String(call[0]).includes('SET points = $2::jsonb')
      );
      expect(write).toBeDefined();
      const written = JSON.parse(String(write![1][1])) as [number, number][];
      expect(written).toHaveLength(points.length);
      expect(written.at(-1)![1]).toBeCloseTo(total, -1);
      // The uniform scaling statement is not used.
      expect(
        sqlOf().some((s) => s.includes('jsonb_array_elements(points)'))
      ).toBe(false);
    });

    it('falls back to scaling every row when the series cannot be split', async () => {
      client.query.mockImplementation(async (sql: string) =>
        sql.includes('SELECT points FROM exercise_entry_distance_series')
          ? { rows: [{ points: points.slice(0, 3) }] }
          : answer(sql)
      );
      await setExerciseEntryDistance(userId, 'actor-1', entryId, {
        distance_km: 5,
        belt_speed_mps: belt,
      });
      expect(
        sqlOf().some((s) => s.includes('jsonb_array_elements(points)'))
      ).toBe(true);
      expect(sqlOf().some((s) => s.includes('SET points = $2::jsonb'))).toBe(
        false
      );
    });

    it('does not read the series when no belt speed is given', async () => {
      await setExerciseEntryDistance(userId, 'actor-1', entryId, {
        distance_km: 5,
      });
      expect(
        sqlOf().some((s) =>
          s.includes('SELECT points FROM exercise_entry_distance_series')
        )
      ).toBe(false);
    });
  });
});
