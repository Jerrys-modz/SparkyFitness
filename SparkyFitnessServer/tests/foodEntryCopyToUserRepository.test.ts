import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import {
  copyReviewedFoodEntriesFromUser,
  copySelectedFoodEntriesFromUser,
} from '../models/foodEntry.js';
import {
  foodEntryCopyFingerprint,
  foodEntryCopyToUserFingerprint,
} from '@workspace/shared';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const row = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: 'actor',
  entry_date: '2026-10-27',
  meal_type_id: 'source-meal',
  quantity: 100,
  food_id: null,
  variant_id: null,
  food_entry_meal_id: 'source-container',
  food_name: 'Saved food',
  serving_size: 100,
  unit: 'g',
  serving_unit: 'g',
  calories: 120,
  protein: 10,
  notes: 'Saved note',
  water_ml: 50,
};
const baseInput = {
  sourceUserId: 'actor',
  actingUserId: 'actor',
  targetUserId: 'recipient',
  sourceDate: row.entry_date,
  targetDate: '2026-10-28',
  targetMealTypeId: 'recipient-meal',
  fingerprintVersion: 'to-user' as const,
};
const wholeInput = () => ({
  ...baseInput,
  sourceMealTypeId: row.meal_type_id,
  reviewedEntries: [
    { entryId: row.id, sourceFingerprint: foodEntryCopyToUserFingerprint(row) },
  ],
});
const selectedInput = () => ({
  ...baseInput,
  selections: [
    {
      entryId: row.id,
      sourceFingerprint: foodEntryCopyToUserFingerprint(row),
      quantity: 175,
    },
  ],
});

describe('copy-to-family atomic repository', () => {
  const query = vi.fn();
  const release = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClient).mockResolvedValue({ query, release });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM food_entries fe')) return { rows: [row] };
      if (sql.includes('FROM meal_types'))
        return { rows: [{ id: baseInput.targetMealTypeId }] };
      if (sql.includes('FROM food_entry_meals'))
        return {
          rows: [
            {
              id: 'source-container',
              meal_template_id: null,
              name: 'Saved meal',
              description: 'Meal description',
              notes: 'Meal note',
              quantity: 2,
              unit: 'serving',
              legacy_serving_unit_math: false,
              entry_total_servings: 4,
            },
          ],
        };
      if (sql.includes('INSERT INTO food_entry_meals'))
        return { rows: [{ id: 'copied-container' }] };
      if (sql.includes('INSERT INTO food_entries'))
        return { rows: [{ id: 'copied-row' }] };
      return { rows: [] };
    });
  });

  it('copies grouped meals and snapshot-only foods in one actor-scoped transaction', async () => {
    await expect(
      copyReviewedFoodEntriesFromUser(wholeInput())
    ).resolves.toEqual([{ id: 'copied-row' }]);
    expect(getClient).toHaveBeenCalledExactlyOnceWith('recipient', 'actor');
    expect(query).toHaveBeenNthCalledWith(
      1,
      'BEGIN ISOLATION LEVEL SERIALIZABLE'
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR SHARE'), [
      'actor',
      row.entry_date,
      'source-meal',
    ]);
    const mealInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entry_meals')
    );
    expect(mealInsert?.[1]).toEqual(
      expect.arrayContaining(['recipient', 'Saved meal', 'Meal note', 2])
    );
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entries')
    );
    expect(insert?.[1]).toEqual(
      expect.arrayContaining([
        'recipient',
        null,
        100,
        120,
        'Saved note',
        'copied-container',
      ])
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('copies selected components as standalone adjusted rows while preserving nutrient basis and notes', async () => {
    await expect(
      copySelectedFoodEntriesFromUser(selectedInput())
    ).resolves.toEqual([{ id: 'copied-row' }]);
    const sqls = query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqls.some((sql) => sql.includes('INSERT INTO food_entry_meals'))
    ).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('fe.id = ANY'), [
      'actor',
      row.entry_date,
      [row.id],
    ]);
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entries')
    );
    expect(insert?.[1][3]).toBe(175);
    expect(insert?.[1][9]).toBeNull();
    expect(insert?.[1][14]).toBe(100);
    expect(insert?.[1][16]).toBe(120);
    expect(insert?.[1][38]).toBe('Saved note');
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each(['whole', 'selected'] as const)(
    'rejects source changes after preliminary validation for %s copies before creating any rows',
    async (mode) => {
      query.mockImplementation(async (sql: string) => ({
        rows: sql.includes('FROM food_entries fe')
          ? [{ ...row, quantity: 101 }]
          : [],
      }));
      await expect(
        mode === 'whole'
          ? copyReviewedFoodEntriesFromUser(wholeInput())
          : copySelectedFoodEntriesFromUser(selectedInput())
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))
      ).toBe(false);
      expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    }
  );

  it('rolls back created containers when an entry insert fails', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO food_entries'))
        throw new Error('Insert failed');
      return normalQuery(sql);
    });
    await expect(copyReviewedFoodEntriesFromUser(wholeInput())).rejects.toThrow(
      'Insert failed'
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO food_entry_meals')
      )
    ).toBe(true);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('maps a selected source serialization race to 409 and rolls back', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM food_entries fe'))
        throw Object.assign(new Error('Concurrent update'), { code: '40001' });
      return normalQuery(sql);
    });
    await expect(
      copySelectedFoodEntriesFromUser(selectedInput())
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it.each([
    ['matching catalog identity', 'food', 'variant', 0],
    ['legacy null variant', 'food', null, 1],
    ['unlinked snapshot', null, null, 1],
  ] as const)(
    'preserves legacy selected duplicate behavior for %s',
    async (_case, foodId, variantId, expectedCopies) => {
      const sourceRow = { ...row, food_id: foodId, variant_id: variantId };
      const normalQuery = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM food_entries fe')) return { rows: [sourceRow] };
        if (sql.includes('SELECT food_id, variant_id'))
          return { rows: [{ food_id: foodId, variant_id: variantId }] };
        return normalQuery(sql);
      });
      const result = await copySelectedFoodEntriesFromUser({
        ...baseInput,
        fingerprintVersion: undefined,
        selections: [
          {
            entryId: row.id,
            sourceFingerprint: foodEntryCopyFingerprint(sourceRow),
            quantity: 125,
          },
        ],
      });
      expect(result).toHaveLength(expectedCopies);
      expect(
        query.mock.calls.filter(([sql]) =>
          String(sql).includes('INSERT INTO food_entries')
        )
      ).toHaveLength(expectedCopies);
    }
  );

  it('rechecks recipient meal ownership before making any insert', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM meal_types') ? { rows: [] } : normalQuery(sql)
    );
    await expect(
      copySelectedFoodEntriesFromUser(selectedInput())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))
    ).toBe(false);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
