import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Bind positions of `modality` in the two writer statements.
const CREATE_MODALITY_PARAM = 17;
const UPDATE_MODALITY_PARAM = 15;
// load_convention follows source_id, so it sits two binds after modality.
const CREATE_LOAD_CONVENTION_PARAM = 18;
const UPDATE_LOAD_CONVENTION_PARAM = 17;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastQuery(mockClient: any): [string, unknown[]] {
  return mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1];
}

describe('exercise modality writers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createExercise', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function captureCreateBind(exerciseData: any) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
        ...exerciseData,
      });
      return lastQuery(mockClient)[1][CREATE_MODALITY_PARAM];
    }

    it('derives modality from the category when none is supplied', async () => {
      expect(await captureCreateBind({ category: 'Cardio' })).toBe(
        'duration_distance'
      );
      expect(await captureCreateBind({ category: 'Isometrics' })).toBe(
        'duration'
      );
      expect(await captureCreateBind({ category: 'strength' })).toBe(
        'weight_reps'
      );
    });

    it('derives weight_reps when the category is absent', async () => {
      expect(await captureCreateBind({})).toBe('weight_reps');
    });

    it('stores an explicit valid modality instead of the derived one', async () => {
      expect(
        await captureCreateBind({ category: 'Cardio', modality: 'reps_only' })
      ).toBe('reps_only');
    });

    it('sanitizes an unrecognized modality to the derived value', async () => {
      expect(
        await captureCreateBind({ category: 'Cardio', modality: 'time_only' })
      ).toBe('duration_distance');
      expect(
        await captureCreateBind({ category: 'strength', modality: 42 })
      ).toBe('weight_reps');
    });

    it('writes modality into the INSERT column list', async () => {
      await captureCreateBind({ category: 'strength' });
      expect(lastQuery(mockClient)[0]).toContain('modality');
    });
  });

  describe('updateExercise', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function captureUpdateBind(updateData: any) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.updateExercise(uuidv4(), uuidv4(), updateData);
      return lastQuery(mockClient)[1][UPDATE_MODALITY_PARAM];
    }

    it('passes a valid modality through', async () => {
      expect(await captureUpdateBind({ modality: 'duration' })).toBe(
        'duration'
      );
    });

    // COALESCE($16, modality) keeps the stored value when the bind is null.
    it('binds null when modality is omitted', async () => {
      expect(await captureUpdateBind({ name: 'Renamed' })).toBeNull();
    });

    it('binds null for an unrecognized modality rather than failing the CHECK', async () => {
      expect(await captureUpdateBind({ modality: 'time_only' })).toBeNull();
    });

    it('does not re-derive modality when only the category changes', async () => {
      expect(await captureUpdateBind({ category: 'Cardio' })).toBeNull();
    });

    it('keeps the exercise id as the last bind after the modality param', async () => {
      const id = uuidv4();
      mockClient.query.mockResolvedValueOnce({ rows: [{ id }] });
      await exerciseDb.updateExercise(id, uuidv4(), { modality: 'duration' });
      const params = lastQuery(mockClient)[1];
      expect(params[params.length - 1]).toBe(id);
      // modality, source_id, load_convention, then the exercise id.
      expect(params).toHaveLength(UPDATE_MODALITY_PARAM + 4);
    });
  });

  describe('load convention (#3157)', () => {
    async function createBind(exerciseData: object) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
        category: 'Strength',
        ...exerciseData,
      });
      return lastQuery(mockClient)[1][CREATE_LOAD_CONVENTION_PARAM];
    }

    it('creates an exercise with the chosen convention, and total when none is given', async () => {
      expect(await createBind({ load_convention: 'per_hand' })).toBe(
        'per_hand'
      );
      expect(await createBind({})).toBe('total');
      expect(await createBind({ load_convention: 'bogus' })).toBe('total');
    });

    it('binds null on update when the convention is omitted or unrecognized, and leaves entries alone', async () => {
      for (const updateData of [
        { name: 'Renamed' },
        { load_convention: 'x' },
      ]) {
        mockClient.query.mockReset();
        mockClient.query.mockResolvedValue({ rows: [{ id: uuidv4() }] });
        await exerciseDb.updateExercise(uuidv4(), uuidv4(), updateData);
        expect(mockClient.query).toHaveBeenCalledTimes(1);
        expect(
          mockClient.query.mock.calls[0][1][UPDATE_LOAD_CONVENTION_PARAM]
        ).toBeNull();
      }
    });

    it('carries a changed convention to the exercise entries it was logged on', async () => {
      const id = uuidv4();
      mockClient.query.mockReset();
      mockClient.query.mockResolvedValue({ rows: [{ id }] });
      await exerciseDb.updateExercise(id, uuidv4(), {
        load_convention: 'per_side',
      });
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(
        mockClient.query.mock.calls[0][1][UPDATE_LOAD_CONVENTION_PARAM]
      ).toBe('per_side');
      const [sql, params] = mockClient.query.mock.calls[1];
      expect(sql).toContain('UPDATE exercise_entries SET load_convention');
      expect(params).toEqual(['per_side', id]);
    });
  });

  describe('getOrCreateActiveCaloriesExercise', () => {
    it('labels the bootstrapped Cardio exercise duration_distance', async () => {
      mockClient.query.mockImplementation(async (sql: string) =>
        sql.startsWith('INSERT') ? { rows: [{ id: uuidv4() }] } : { rows: [] }
      );

      await exerciseDb.getOrCreateActiveCaloriesExercise(uuidv4());

      const insertParams = mockClient.query.mock.calls.find(([sql]: [string]) =>
        String(sql).includes('INSERT INTO exercises')
      )?.[1];
      expect(insertParams[insertParams.length - 1]).toBe('duration_distance');
    });
  });
});
