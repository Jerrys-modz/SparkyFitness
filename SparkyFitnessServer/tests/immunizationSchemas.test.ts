import { describe, expect, it } from 'vitest';
import {
  createImmunizationBodySchema,
  immunizationListQuerySchema,
  updateImmunizationBodySchema,
} from '@workspace/shared';

const valid = {
  vaccine_name: 'Influenza',
  administered_on: '2026-10-01',
};

describe('createImmunizationBodySchema', () => {
  it('accepts a minimal record', () => {
    expect(createImmunizationBodySchema.safeParse(valid).success).toBe(true);
  });

  it('drops a source a client sends, so only an import can write one', () => {
    expect(
      createImmunizationBodySchema.parse({ ...valid, source: 'import' })
    ).not.toHaveProperty('source');
  });

  it('accepts every optional field', () => {
    expect(
      createImmunizationBodySchema.safeParse({
        ...valid,
        vaccine_code: '141',
        dose_number: 2,
        lot_number: 'AB123',
        administered_by: 'Walgreens',
        site: 'Left arm',
        next_due_on: '2027-10-01',
        notes: 'Annual',
      }).success
    ).toBe(true);
  });

  it('rejects a missing name or date', () => {
    expect(
      createImmunizationBodySchema.safeParse({ administered_on: '2026-10-01' })
        .success
    ).toBe(false);
    expect(
      createImmunizationBodySchema.safeParse({ vaccine_name: 'Tdap' }).success
    ).toBe(false);
  });

  it('rejects a date that is not a real calendar day', () => {
    expect(
      createImmunizationBodySchema.safeParse({
        ...valid,
        administered_on: '2026-02-31',
      }).success
    ).toBe(false);
  });

  it('rejects a next-due date before the date given', () => {
    expect(
      createImmunizationBodySchema.safeParse({
        ...valid,
        next_due_on: '2026-09-30',
      }).success
    ).toBe(false);
  });

  it('allows the next-due date on the same day', () => {
    expect(
      createImmunizationBodySchema.safeParse({
        ...valid,
        next_due_on: '2026-10-01',
      }).success
    ).toBe(true);
  });

  it('rejects an out-of-range dose number', () => {
    for (const dose_number of [0, 21, 1.5]) {
      expect(
        createImmunizationBodySchema.safeParse({ ...valid, dose_number })
          .success
      ).toBe(false);
    }
  });
});

describe('updateImmunizationBodySchema', () => {
  it('accepts a partial update and null to clear a field', () => {
    expect(
      updateImmunizationBodySchema.safeParse({ lot_number: null }).success
    ).toBe(true);
    expect(
      updateImmunizationBodySchema.safeParse({ dose_number: 3 }).success
    ).toBe(true);
  });

  it('still rejects a next-due date before the date given in the same body', () => {
    expect(
      updateImmunizationBodySchema.safeParse({
        administered_on: '2026-10-01',
        next_due_on: '2026-01-01',
      }).success
    ).toBe(false);
  });
});

describe('immunizationListQuerySchema', () => {
  it('defaults the limit', () => {
    expect(immunizationListQuerySchema.parse({}).limit).toBe(1000);
  });

  it('rejects a bad date', () => {
    expect(
      immunizationListQuerySchema.safeParse({ startDate: 'yesterday' }).success
    ).toBe(false);
  });
});
