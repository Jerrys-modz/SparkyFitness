import { describe, expect, it } from 'vitest';
import {
  createCalorieMaintenancePeriodBodySchema,
  maintenancePeriodOnDay,
} from '@workspace/shared';

describe('createCalorieMaintenancePeriodBodySchema', () => {
  const ok = (body: unknown) =>
    createCalorieMaintenancePeriodBodySchema.safeParse(body).success;

  it('takes a refeed on one day, with or without an end', () => {
    expect(ok({ kind: 'refeed_day', start_date: '2026-10-26' })).toBe(true);
    expect(
      ok({
        kind: 'refeed_day',
        start_date: '2026-10-26',
        end_date: '2026-10-26',
      })
    ).toBe(true);
  });

  it('refuses a refeed that spans days', () => {
    expect(
      ok({
        kind: 'refeed_day',
        start_date: '2026-10-26',
        end_date: '2026-10-27',
      })
    ).toBe(false);
  });

  it('needs an end for a diet break and allows up to 28 days', () => {
    expect(ok({ kind: 'diet_break', start_date: '2026-10-26' })).toBe(false);
    expect(
      ok({
        kind: 'diet_break',
        start_date: '2026-10-01',
        end_date: '2026-10-28',
      })
    ).toBe(true);
    expect(
      ok({
        kind: 'diet_break',
        start_date: '2026-10-01',
        end_date: '2026-10-29',
      })
    ).toBe(false);
  });

  it('refuses an end before the start and a day that is not real', () => {
    expect(
      ok({
        kind: 'diet_break',
        start_date: '2026-10-10',
        end_date: '2026-10-09',
      })
    ).toBe(false);
    expect(ok({ kind: 'refeed_day', start_date: '2026-02-30' })).toBe(false);
  });
});

describe('maintenancePeriodOnDay', () => {
  const brk = {
    kind: 'diet_break' as const,
    start_date: '2026-10-20',
    end_date: '2026-10-30',
  };
  const refeed = {
    kind: 'refeed_day' as const,
    start_date: '2026-10-25',
    end_date: '2026-10-25',
  };

  it('includes both ends and nothing outside', () => {
    expect(maintenancePeriodOnDay([brk], '2026-10-19')).toBeNull();
    expect(maintenancePeriodOnDay([brk], '2026-10-20')).toBe(brk);
    expect(maintenancePeriodOnDay([brk], '2026-10-30')).toBe(brk);
    expect(maintenancePeriodOnDay([brk], '2026-10-31')).toBeNull();
  });

  it('reports the period that started last when they overlap', () => {
    expect(maintenancePeriodOnDay([brk, refeed], '2026-10-25')).toBe(refeed);
    expect(maintenancePeriodOnDay([refeed, brk], '2026-10-25')).toBe(refeed);
    expect(maintenancePeriodOnDay([brk, refeed], '2026-10-26')).toBe(brk);
  });
});
