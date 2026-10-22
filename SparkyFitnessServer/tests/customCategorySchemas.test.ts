import { describe, expect, it } from 'vitest';
import {
  CreateCustomCategoryBodySchema,
  UpdateCustomCategoryBodySchema,
} from '../schemas/measurementSchemas.js';

const base = {
  name: 'hba1c',
  frequency: 'All',
  measurement_type: '%',
};

describe('custom category reference range', () => {
  it('accepts an ordered, one-sided, or absent range', () => {
    for (const range of [
      { ref_range_low: 4, ref_range_high: 5.6 },
      { ref_range_low: 4, ref_range_high: 4 },
      { ref_range_low: null, ref_range_high: 100 },
      { ref_range_low: 40 },
      {},
    ]) {
      expect(
        CreateCustomCategoryBodySchema.safeParse({ ...base, ...range }).success
      ).toBe(true);
      expect(UpdateCustomCategoryBodySchema.safeParse(range).success).toBe(
        true
      );
    }
  });

  it('rejects a low bound above the high bound as a validation error', () => {
    const create = CreateCustomCategoryBodySchema.safeParse({
      ...base,
      ref_range_low: 6,
      ref_range_high: 5,
    });
    expect(create.success).toBe(false);
    expect(create.error?.issues[0]).toMatchObject({
      path: ['ref_range_low'],
      message: 'ref_range_low must not exceed ref_range_high',
    });

    expect(
      UpdateCustomCategoryBodySchema.safeParse({
        ref_range_low: 6,
        ref_range_high: 5,
      }).success
    ).toBe(false);
  });
});
